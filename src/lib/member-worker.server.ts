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
import type { SupabaseClient } from "@supabase/supabase-js";
import { GatewayError, reconnectSession, sendMessage, sessionStatus } from "@/lib/wa-gateway.server";
import { speedDelayMs } from "@/lib/blast-speed";
import { buildMessageBody } from "@/lib/whatsapp";
import type { MediaType, TemplateButton } from "@/types/wa";

const TICK_BUDGET_MS = 20_000;
const CLAIM_SIZE = 25;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 5_000;

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

  while (Date.now() - startedAt < TICK_BUDGET_MS) {
    const { data: batch } = await supabase
      .from("message_queue")
      .select("id,campaign_id,recipient_phone,message_body,attempts")
      .eq("session_id", sessionId)
      .eq("user_id", ownerId)
      .eq("status", "pending")
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
      if (Date.now() - startedAt >= TICK_BUDGET_MS) break;

      const { data: locked } = await supabase
        .from("message_queue")
        .update({ status: "processing" })
        .eq("id", item.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
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

        await supabase
          .from("message_queue")
          .update({
            status: "sent",
            attempts,
            sent_at: new Date().toISOString(),
            error_log: null,
            // Simpan perangkat pengirim agar nomor pengirim muncul di laporan.
            session_id: sessionId,
            sender_phone: senderPhone,
          })
          .eq("id", item.id);
        // Kegagalan mencatat reward tidak boleh menghentikan pengiriman, tetapi
        // harus terlihat di log (rpc tidak melempar; galatnya ada di hasil).
        const { error: creditError } = await supabase.rpc("credit_message_reward", {
          _message_id: item.id,
        });
        if (creditError) console.error("[blast] credit_message_reward gagal:", creditError.message);
        sent += 1;
      } catch (err) {
        const message =
          err instanceof GatewayError ? err.message : ((err as Error).message ?? "Pengiriman gagal");
        const deliveryUnknown = err instanceof GatewayError && err.deliveryUnknown;
        if (deliveryUnknown) {
          await supabase
            .from("message_queue")
            .update({ status: "failed", attempts, error_log: message })
            .eq("id", item.id);
          failed += 1;
          // Sambungan terputus di tengah jalan: perangkat TIDAK dimatikan.
          // Saklar "siap blast" hanya boleh dimatikan oleh worker sendiri.
          // Di sini cukup coba sambungkan ulang, lalu lanjut mengirim.
          const again = await ensureConnected(supabase, sessionId);
          if (!again.connected) {
            note = "Perangkat terputus — pengiriman dilanjutkan otomatis setelah tersambung";
          }
        } else if (attempts < MAX_ATTEMPTS) {
          await supabase
            .from("message_queue")
            .update({
              status: "pending",
              attempts,
              error_log: `${message} (percobaan ${attempts}/${MAX_ATTEMPTS})`,
              scheduled_at: new Date(Date.now() + RETRY_BASE_DELAY_MS * attempts).toISOString(),
              claimed_by: null,
              claimed_at: null,
              session_id: null,
              user_id: null,
            })
            .eq("id", item.id);
        } else {
          await supabase
            .from("message_queue")
            .update({ status: "failed", attempts, error_log: message })
            .eq("id", item.id);
          failed += 1;
        }
        if (!deliveryUnknown && /perangkat whatsapp|session status|error 463|koneksi perangkat/i.test(message)) {
          // Coba sambungkan ulang lalu LANJUT mengirim. Tidak ada penghentian
          // di tengah jalan; kalau masih putus, siklus berikutnya mencoba lagi.
          const again = await ensureConnected(supabase, sessionId);
          if (!again.connected) {
            note = "Perangkat terputus — pengiriman dilanjutkan otomatis setelah tersambung";
            await sleep(1500);
          } else {
            note = undefined;
          }
        }
      }

      await sleep(speedDelayMs(speed));
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
