/**
 * Pekerja blast untuk member. Setiap tick: mengambil sebagian nomor dari kolam
 * proyek admin, lalu mengirimnya lewat perangkat member dengan jeda sesuai
 * kecepatan yang dipilih. Reward otomatis dikreditkan ke member.
 *
 * KEAMANAN: fungsi ini HARUS dipanggil dengan klien server (service role) dan
 * ownerId (pemilik perangkat) yang dibaca dari database. Klaim nomor dan reward
 * dijalankan lewat fungsi database khusus server (claim_blast_batch_for dan
 * credit_message_reward) yang tidak boleh dipanggil dengan token pengguna.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GatewayError, reconnectSession, sendMessage, sessionStatus } from "@/lib/wa-gateway.server";
import { BREAKER_THRESHOLD, RETRY_MAX_ATTEMPTS, backoffMs, classifyFailure } from "@/lib/blast-retry";
import { speedDelayMs } from "@/lib/blast-speed";
import { buildMessageBody } from "@/lib/whatsapp";
import type { MediaType, TemplateButton } from "@/types/wa";

const TICK_BUDGET_MS = 20_000;
// Diperkecil dari 25: dengan jeda aman per nomor, perangkat lambat tidak boleh menimbun banyak nomor.
const CLAIM_SIZE = 5;
const MAX_ATTEMPTS = 3; // galat lain-lain (bukan masalah perangkat)
const RETRY_BASE_DELAY_MS = 5_000;

function logDbError(label: string, error: { message: string } | null | undefined) {
  // Galat supabase-js TIDAK dilempar; tanpa pencatatan ini kegagalan tulis tidak terlihat.
  if (error) console.error(`[blast] ${label} gagal:`, error.message);
}

/** Kembalikan baris ke antrean supaya perangkat lain bisa mengirimnya. user_id TIDAK diubah. */
async function requeueRow(
  supabase: SupabaseClient,
  itemId: string,
  attemptId: string,
  opts: { attempts: number; reason: string; delayMs: number; sessionId: string },
): Promise<void> {
  const { error } = await supabase
    .from("message_queue")
    .update({
      status: "pending",
      attempts: opts.attempts,
      error_log: opts.reason,
      scheduled_at: new Date(Date.now() + opts.delayMs).toISOString(),
      claimed_by: null,
      claimed_at: null,
      session_id: null,
      last_session_id: opts.sessionId,
      attempt_id: null,
      locked_at: null,
    })
    .eq("id", itemId)
    .eq("attempt_id", attemptId);
  logDbError("mengembalikan pesan ke antrean", error);
}

async function failRow(
  supabase: SupabaseClient,
  itemId: string,
  attemptId: string,
  opts: { attempts: number; kind: "invalid" | "exhausted"; message: string },
): Promise<void> {
  const { error } = await supabase
    .from("message_queue")
    .update({
      status: "failed",
      attempts: opts.attempts,
      failure_kind: opts.kind,
      error_log: opts.message,
      locked_at: null,
    })
    .eq("id", itemId)
    .eq("attempt_id", attemptId);
  logDbError("menandai pesan gagal", error);
}

/** Catat kegagalan perangkat. Mengembalikan waktu akhir pendinginan bila perangkat kini didinginkan. */
async function deviceFailed(
  supabase: SupabaseClient,
  sessionId: string,
  reason: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("device_failed", {
    _session_id: sessionId,
    _reason: reason.slice(0, 200),
    _threshold: BREAKER_THRESHOLD,
  });
  logDbError("mencatat kegagalan perangkat", error);
  return typeof data === "string" && new Date(data).getTime() > Date.now() ? data : null;
}

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });

interface CampaignContent {
  message_body: string;
  media_url: string | null;
  media_type: MediaType | null;
  media_filename: string | null;
  footer_text: string | null;
  buttons_json: TemplateButton[] | null;
}


export interface BlastTickResult {
  claimed: number;
  sent: number;
  failed: number;
  remaining: number;
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------------------------------------------------------------------------------------------
 * LAJU AMAN PER NOMOR (perbaikan "ghost chat")
 *
 * Temuan 21 Sep 2026: satu nomor WhatsApp dipasang sebagai beberapa sesi (sampai 4 perangkat
 * tertaut), dan tiap sesi mengirim sendiri dengan jeda mode Kilat/Brutal. Hasilnya satu nomor
 * mengirim ~1 pesan/detik ke orang asing. Aturan baru, dipaksa di server:
 *  1. Satu nomor = satu alur kirim, berapa pun sesinya (kunci di memori proses).
 *  2. Jeda acak antar pesan per NOMOR, dihitung dari sent_at terakhir nomor itu di database,
 *     sehingga berlaku lintas tick, lintas putaran cron, dan lintas sesi.
 *  3. Batas pesan per jam per nomor.
 *  4. Pemanasan: nomor yang baru mengirim sedikit pesan memakai jeda lebih panjang.
 * Mode kecepatan worker hanya bisa MEMPERLAMBAT, tidak bisa lebih cepat dari batas ini.
 * Angka dibaca dari app_settings (baris 'global'); bila kolom belum ada, dipakai nilai bawaan.
 * ------------------------------------------------------------------------------------------- */
interface PacingSettings {
  minSec: number;
  maxSec: number;
  hourlyCap: number;
  warmupCount: number;
  warmupMinSec: number;
  warmupMaxSec: number;
}
const PACING_DEFAULTS: PacingSettings = {
  minSec: 8,
  maxSec: 20,
  hourlyCap: 40,
  warmupCount: 20,
  warmupMinSec: 30,
  warmupMaxSec: 60,
};
/** Batas bawah mutlak: pengaturan apa pun tidak bisa membuat jeda di bawah ini. */
const HARD_MIN_DELAY_SEC = 4;
const PACING_CACHE_MS = 60_000;
let pacingCache: { value: PacingSettings; at: number } | null = null;

function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function loadPacing(supabase: SupabaseClient): Promise<PacingSettings> {
  if (pacingCache && Date.now() - pacingCache.at < PACING_CACHE_MS) return pacingCache.value;
  let value = PACING_DEFAULTS;
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select(
        "blast_min_delay_sec,blast_max_delay_sec,blast_hourly_cap,blast_warmup_count,blast_warmup_min_sec,blast_warmup_max_sec",
      )
      .eq("id", "global")
      .maybeSingle();
    if (error) {
      console.error("[blast] pengaturan laju tidak terbaca (SQL 025 sudah dijalankan?), pakai bawaan:", error.message);
    } else if (data) {
      const d = data as Record<string, unknown>;
      const minSec = clampNum(d.blast_min_delay_sec, PACING_DEFAULTS.minSec, HARD_MIN_DELAY_SEC, 3600);
      const warmupMinSec = clampNum(d.blast_warmup_min_sec, PACING_DEFAULTS.warmupMinSec, minSec, 3600);
      value = {
        minSec,
        maxSec: clampNum(d.blast_max_delay_sec, PACING_DEFAULTS.maxSec, minSec, 3600),
        hourlyCap: clampNum(d.blast_hourly_cap, PACING_DEFAULTS.hourlyCap, 1, 1000),
        warmupCount: clampNum(d.blast_warmup_count, PACING_DEFAULTS.warmupCount, 0, 10_000),
        warmupMinSec,
        warmupMaxSec: clampNum(d.blast_warmup_max_sec, PACING_DEFAULTS.warmupMaxSec, warmupMinSec, 3600),
      };
    }
  } catch (err) {
    console.error("[blast] pengaturan laju gagal dibaca, pakai bawaan:", err instanceof Error ? err.message : err);
  }
  pacingCache = { value, at: Date.now() };
  return value;
}

/** Jeda berikutnya (ms) untuk satu nomor. Mode kecepatan hanya boleh memperlambat. */
function pickDelayMs(p: PacingSettings, sentTotal: number, speed: string): number {
  const warm = sentTotal < p.warmupCount;
  const lo = warm ? p.warmupMinSec : p.minSec;
  const hi = warm ? p.warmupMaxSec : p.maxSec;
  const ms = Math.round((lo + Math.random() * Math.max(0, hi - lo)) * 1000);
  return Math.max(ms, speedDelayMs(speed), HARD_MIN_DELAY_SEC * 1000);
}

interface PhoneStats {
  lastHour: number;
  total: number;
  lastSentAt: number; // epoch ms; 0 = belum pernah
}

/** Riwayat kirim satu nomor dari database (berlaku lintas sesi dan lintas putaran). */
async function phoneStats(supabase: SupabaseClient, phone: string): Promise<PhoneStats> {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const [hour, total, last] = await Promise.all([
    supabase
      .from("message_queue")
      .select("id", { count: "exact", head: true })
      .eq("sender_phone", phone)
      .eq("status", "sent")
      .gte("sent_at", hourAgo),
    supabase
      .from("message_queue")
      .select("id", { count: "exact", head: true })
      .eq("sender_phone", phone)
      .eq("status", "sent"),
    supabase
      .from("message_queue")
      .select("sent_at")
      .eq("sender_phone", phone)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  logDbError("menghitung pesan per jam", hour.error);
  logDbError("menghitung total pesan nomor", total.error);
  const lastIso = (last.data as { sent_at?: string | null } | null)?.sent_at ?? null;
  return {
    lastHour: hour.count ?? 0,
    total: total.count ?? 0,
    lastSentAt: lastIso ? new Date(lastIso).getTime() : 0,
  };
}

/** Nomor yang sedang punya alur kirim aktif di proses ini. Satu nomor = satu alur. */
const activePhones = new Set<string>();

async function releaseRows(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { error } = await supabase.rpc("release_device_rows", { _session_id: sessionId });
  logDbError("melepas tugas perangkat", error);
}

async function ensureConnected(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ connected: boolean; phone?: string | null; error?: string }> {
  try {
    let live = await sessionStatus(sessionId);
    if (live.status !== "connected") live = await reconnectSession(sessionId);
    await supabase
      .from("wa_sessions")
      .update({
        status: live.status,
        phone_number: live.phone,
        battery_level: live.battery,
        last_ping: live.status === "connected" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    return { connected: live.status === "connected", phone: live.phone ?? null };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "Status perangkat tidak dapat diperiksa",
    };
  }
}

/**
 * Mengambil nomor dari antrean untuk satu perangkat. Isolasi antar-pengguna
 * dijaga di fungsi database: hanya kampanye milik admin (kolam bersama) atau
 * milik pemilik perangkat itu sendiri yang bisa diklaim.
 */
async function claimBatch(
  supabase: SupabaseClient,
  sessionId: string,
  ownerId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("claim_blast_batch_for", {
    _user_id: ownerId,
    _session_id: sessionId,
    _limit: CLAIM_SIZE,
  });
  if (error) {
    // Gagal tertutup: tanpa fungsi/izin yang benar, tidak ada nomor yang diklaim.
    console.error("[blast] claim_blast_batch_for gagal:", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

export async function processBlastTick(
  supabase: SupabaseClient,
  sessionId: string,
  speed: string,
  ownerId: string,
): Promise<BlastTickResult> {
  const connection = await ensureConnected(supabase, sessionId);
  // Nomor perangkat pengirim disimpan di setiap baris terkirim agar laporan
  // tetap menampilkannya walau sesi perangkat nanti terhapus.
  const senderPhone = connection.phone ?? null;
  if (!connection.connected) {
    return {
      claimed: 0,
      sent: 0,
      failed: 0,
      remaining: 0,
      error: connection.error ?? "Perangkat belum terhubung — akan dicoba lagi otomatis",
    };
  }

  // Perangkat yang sedang didinginkan (kegagalan beruntun) tidak mengambil atau mengirim apa pun.
  const { data: health } = await supabase
    .from("wa_sessions")
    .select("cooldown_until,fail_streak")
    .eq("id", sessionId)
    .maybeSingle();
  const cooldownUntil = (health as { cooldown_until?: string | null } | null)?.cooldown_until ?? null;
  const failStreak = Number((health as { fail_streak?: number | null } | null)?.fail_streak ?? 0);
  if (cooldownUntil && new Date(cooldownUntil).getTime() > Date.now()) {
    return {
      claimed: 0,
      sent: 0,
      failed: 0,
      remaining: 0,
      error: `Perangkat didinginkan sampai ${hhmm(cooldownUntil)} WIB (kegagalan beruntun)`,
    };
  }

  // Satu nomor = satu alur kirim. Sesi lain dengan nomor yang sama melepas tugasnya dan menunggu.
  const pacingKey = senderPhone ? `phone:${senderPhone}` : `session:${sessionId}`;
  if (activePhones.has(pacingKey)) {
    await releaseRows(supabase, sessionId);
    return {
      claimed: 0,
      sent: 0,
      failed: 0,
      remaining: 0,
      error: "Nomor ini sedang mengirim lewat perangkat lain (satu nomor hanya boleh satu alur kirim)",
    };
  }
  activePhones.add(pacingKey);
  try {
    return await runTick(supabase, sessionId, speed, ownerId, senderPhone, failStreak);
  } finally {
    activePhones.delete(pacingKey);
  }
}

async function runTick(
  supabase: SupabaseClient,
  sessionId: string,
  speed: string,
  ownerId: string,
  senderPhone: string | null,
  initialFailStreak: number,
): Promise<BlastTickResult> {
  let failStreak = initialFailStreak;
  const pacing = await loadPacing(supabase);
  // Tanpa nomor (jarang terjadi saat tersambung) riwayat tidak bisa dihitung: pakai jeda pemanasan.
  const stats: PhoneStats = senderPhone
    ? await phoneStats(supabase, senderPhone)
    : { lastHour: 0, total: 0, lastSentAt: 0 };
  let sentLastHour = stats.lastHour;
  let sentTotal = stats.total;
  let nextAllowedAt = stats.lastSentAt ? stats.lastSentAt + pickDelayMs(pacing, sentTotal, speed) : 0;

  // Batas per jam tercapai: jangan mengambil pekerjaan, lepaskan yang sudah diambil.
  if (sentLastHour >= pacing.hourlyCap) {
    await releaseRows(supabase, sessionId);
    return {
      claimed: 0,
      sent: 0,
      failed: 0,
      remaining: 0,
      error: `Batas ${pacing.hourlyCap} pesan per jam untuk nomor ini tercapai — dilanjutkan otomatis`,
    };
  }

  // Ambil pekerjaan baru dari kolam bila sisa pekerjaan perangkat ini sedikit.
  let claimed = 0;
  const { count: own } = await supabase
    .from("message_queue")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("user_id", ownerId)
    .eq("status", "pending");
  if ((own ?? 0) < CLAIM_SIZE) {
    claimed = await claimBatch(supabase, sessionId, ownerId);
  }

  const startedAt = Date.now();
  let sent = 0;
  let failed = 0;
  let note: string | undefined;

  // Isi pesan kampanye (teks, gambar, lampiran) dibaca sekali lalu dipakai
  // ulang, supaya pesan yang terkirim sama persis dengan pratinjau kampanye.
  const campaignCache = new Map<string, CampaignContent | null>();
  async function campaignContent(campaignId: string | null): Promise<CampaignContent | null> {
    if (!campaignId) return null;
    if (campaignCache.has(campaignId)) return campaignCache.get(campaignId) ?? null;
    // Kampanye biasanya milik admin, sedangkan tick ini berjalan dengan akses
    // member. Dengan klien member, RLS menyembunyikan baris kampanye sehingga
    // gambar/tombol hilang dan hanya teks antrean yang terkirim. Karena itu isi
    // kampanye dibaca memakai klien server berhak penuh (hanya baca konten).
    const columns = "message_body,media_url,media_type,media_filename,footer_text,buttons_json";
    let row: CampaignContent | null = null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await (supabaseAdmin as unknown as typeof supabase)
        .from("campaigns")
        .select(columns)
        .eq("id", campaignId)
        .maybeSingle();
      row = (data ?? null) as CampaignContent | null;
    } catch {
      row = null;
    }
    if (!row) {
      const { data } = await supabase
        .from("campaigns")
        .select(columns)
        .eq("id", campaignId)
        .maybeSingle();
      row = (data ?? null) as CampaignContent | null;
    }
    campaignCache.set(campaignId, row);
    return row;
  }

  let stop = false;
  while (!stop && Date.now() - startedAt < TICK_BUDGET_MS) {
    const { data: batch } = await supabase
      .from("message_queue")
      .select("id,campaign_id,recipient_phone,message_body,attempts")
      .eq("session_id", sessionId)
      .eq("user_id", ownerId)
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(20);

    const queue = (batch ?? []) as Array<{
      id: string;
      campaign_id: string | null;
      recipient_phone: string;
      message_body: string;
      attempts: number;
    }>;
    if (!queue.length) {
      // Tidak ada sisa untuk perangkat ini: ambil lagi dari kolam kampanye
      // berjalan. Pengiriman TIDAK pernah dihentikan di sini — selama masih
      // ada kampanye aktif, perangkat terus mencari pekerjaan.
      const got = await claimBatch(supabase, sessionId, ownerId);
      claimed += got;
      if (!got) await sleep(1500);
      continue;
    }

    for (const item of queue) {
      if (stop || Date.now() - startedAt >= TICK_BUDGET_MS) break;

      // Batas per jam per nomor.
      if (sentLastHour >= pacing.hourlyCap) {
        await releaseRows(supabase, sessionId);
        note = `Batas ${pacing.hourlyCap} pesan per jam untuk nomor ini tercapai — dilanjutkan otomatis`;
        stop = true;
        break;
      }
      // Jeda aman per nomor. Bila jedanya melewati sisa anggaran tick, berhenti; putaran berikutnya
      // menghitung ulang dari sent_at terakhir di database, jadi jeda tetap terjaga.
      const wait = nextAllowedAt - Date.now();
      if (wait > 0) {
        if (Date.now() + wait - startedAt >= TICK_BUDGET_MS) {
          note = `Menunggu jeda aman (${Math.ceil(wait / 1000)} detik)`;
          stop = true;
          break;
        }
        await sleep(wait);
      }

      // Kunci baris. attempt_id mengikat penyelesaian ke percobaan INI: bila baris sudah
      // dikembalikan sapuan lalu diambil perangkat lain, penyelesaian terlambat tidak menimpanya.
      const attemptId = randomUUID();
      const { data: locked, error: lockError } = await supabase
        .from("message_queue")
        .update({ status: "processing", locked_at: new Date().toISOString(), attempt_id: attemptId })
        .eq("id", item.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      logDbError("mengunci pesan (sudah menjalankan migrasi 024?)", lockError);
      if (!locked) continue;

      const attempts = item.attempts + 1;
      try {
        const campaign = await campaignContent(item.campaign_id);
        const source = campaign?.message_body?.trim() || item.message_body;
        // Variabel {{phone}} / {{name}} diisi sesuai nomor penerima.
        const text = buildMessageBody(source, {
          phone: item.recipient_phone,
          name: item.recipient_phone,
        });
        const mediaUrl = campaign?.media_url?.trim() || null;
        const mediaType =
          mediaUrl && (!campaign?.media_type || campaign.media_type === "text")
            ? "image"
            : (campaign?.media_type ?? "text");
        await sendMessage({
          sessionId,
          to: item.recipient_phone,
          text,
          mediaUrl,
          mediaType,
          mediaFilename: campaign?.media_filename ?? null,
          footerText: campaign?.footer_text ?? null,
          buttons: campaign?.buttons_json ?? null,
        });

        const { data: done, error: doneError } = await supabase
          .from("message_queue")
          .update({
            status: "sent",
            attempts,
            sent_at: new Date().toISOString(),
            error_log: null,
            failure_kind: null,
            locked_at: null,
            // Simpan perangkat pengirim agar nomor pengirim muncul di laporan.
            session_id: sessionId,
            last_session_id: sessionId,
            sender_phone: senderPhone,
          })
          .eq("id", item.id)
          .eq("attempt_id", attemptId)
          .select("id")
          .maybeSingle();
        logDbError("menandai pesan terkirim", doneError);
        if (!done) {
          // Baris sudah dikembalikan/diambil perangkat lain saat pengiriman ini berjalan.
          // Jangan menimpa dan jangan mengkredit dua kali; pengirim yang menyelesaikan
          // baris itu yang dibayar.
          console.warn("[blast] penyelesaian terlambat diabaikan (baris sudah diambil lagi):", item.id);
          continue;
        }

        // Kegagalan mencatat reward tidak boleh menghentikan pengiriman, tetapi
        // harus terlihat di log (rpc tidak melempar; galatnya ada di hasil).
        const { error: creditError } = await supabase.rpc("credit_message_reward", {
          _message_id: item.id,
        });
        if (creditError) console.error("[blast] credit_message_reward gagal:", creditError.message);
        sent += 1;
        sentLastHour += 1;
        sentTotal += 1;
        if (failStreak > 0) {
          failStreak = 0;
          const { error: okError } = await supabase.rpc("device_ok", { _session_id: sessionId });
          logDbError("memulihkan status perangkat", okError);
        }
      } catch (err) {
        const message =
          err instanceof GatewayError ? err.message : ((err as Error).message ?? "Pengiriman gagal");
        const kind = classifyFailure({
          message,
          ...(err instanceof GatewayError && typeof err.status === "number"
            ? { status: err.status }
            : {}),
          deliveryUnknown: err instanceof GatewayError && err.deliveryUnknown,
        });
        let deviceProblem = false;

        if (kind === "invalid") {
          // Nomor tidak valid: hasilnya tidak akan berubah, jadi final.
          await failRow(supabase, item.id, attemptId, { attempts, kind: "invalid", message });
          failed += 1;
        } else if (kind === "not_sent") {
          // PASTI belum terkirim: kembalikan tanpa menghabiskan percobaan pesan.
          await requeueRow(supabase, item.id, attemptId, {
            attempts: item.attempts,
            reason: `${message} (dikembalikan ke antrean, percobaan tidak dihitung)`,
            delayMs: 0,
            sessionId,
          });
          deviceProblem = true;
        } else if (kind === "unknown" || kind === "device_reject") {
          // Tidak pasti / ditolak lewat perangkat ini: diulang otomatis oleh perangkat lain.
          if (attempts >= RETRY_MAX_ATTEMPTS) {
            await failRow(supabase, item.id, attemptId, {
              attempts,
              kind: "exhausted",
              message: `${message} (percobaan habis ${attempts}/${RETRY_MAX_ATTEMPTS})`,
            });
            failed += 1;
          } else {
            await requeueRow(supabase, item.id, attemptId, {
              attempts,
              reason: `${message} (percobaan ${attempts}/${RETRY_MAX_ATTEMPTS}, diulang otomatis oleh perangkat lain)`,
              delayMs: backoffMs(attempts),
              sessionId,
            });
          }
          deviceProblem = true;
        } else if (attempts < MAX_ATTEMPTS) {
          await requeueRow(supabase, item.id, attemptId, {
            attempts,
            reason: `${message} (percobaan ${attempts}/${MAX_ATTEMPTS})`,
            delayMs: RETRY_BASE_DELAY_MS * attempts,
            sessionId,
          });
        } else {
          await failRow(supabase, item.id, attemptId, { attempts, kind: "exhausted", message });
          failed += 1;
        }

        if (deviceProblem) {
          // Kegagalan yang berasal dari perangkat/koneksi, bukan dari pesan. Hitung ke pemutus
          // sirkuit; bila sudah melewati batas, perangkat didinginkan dan tugasnya dilepas.
          failStreak += 1;
          const cooled = await deviceFailed(supabase, sessionId, message);
          const again = cooled ? { connected: false } : await ensureConnected(supabase, sessionId);
          if (cooled || !again.connected) {
            const { error: releaseError } = await supabase.rpc("release_device_rows", {
              _session_id: sessionId,
            });
            logDbError("melepas tugas perangkat", releaseError);
            note = cooled
              ? `Perangkat didinginkan sampai ${hhmm(cooled)} WIB — tugasnya dialihkan ke perangkat lain`
              : "Perangkat terputus — tugasnya dialihkan, dilanjutkan otomatis setelah tersambung";
            stop = true;
            break;
          }
          note = undefined;
        }
      }

      // Jeda berikutnya berlaku untuk hasil apa pun (terkirim maupun gagal).
      nextAllowedAt = Date.now() + pickDelayMs(pacing, sentTotal, speed);
    }
  }

  // Kampanye yang seluruh nomornya sudah diproses otomatis ditandai selesai.
  try {
    await supabase.rpc("complete_pool_campaigns");
  } catch {
    /* tidak menghalangi pengiriman */
  }

  const { count: remaining } = await supabase
    .from("message_queue")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("user_id", ownerId)
    .in("status", ["pending", "processing"]);

  return { claimed, sent, failed, remaining: remaining ?? 0, ...(note ? { error: note } : {}) };
}
