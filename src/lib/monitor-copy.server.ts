/**
 * Nomor Pantau — salinan pesan pengawasan.
 *
 * Saat kampanye berjalan, pengirim yang memenuhi aturan (nomor pengirim
 * tertentu, worker tertentu, atau penerima dengan kode negara tertentu) ikut
 * mengirim salinan pesan ke nomor pantau setiap N pesan.
 *
 * Salinan pantau TIDAK pernah ditulis ke message_queue, sehingga tidak
 * menghasilkan reward dan tidak muncul di laporan riwayat pengiriman.
 * Semua galat ditelan: pengawasan tidak boleh mengganggu pengiriman utama.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage } from "@/lib/wa-gateway.server";
import type { MediaType, TemplateButton } from "@/types/wa";

interface MonitorConfig {
  enabled: boolean;
  interval: number;
  countryCodes: string[];
  includeNote: boolean;
  numbers: string[];
  senderPhones: Set<string>;
  workerIds: Set<string>;
}

const CACHE_MS = 30_000;
let cache: { value: MonitorConfig; at: number } | null = null;

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

export function parseCountryCodes(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((c) => c.replace(/\D/g, ""))
    .filter(Boolean);
}

async function loadConfig(supabase: SupabaseClient): Promise<MonitorConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const empty: MonitorConfig = {
    enabled: false,
    interval: 20,
    countryCodes: [],
    includeNote: true,
    numbers: [],
    senderPhones: new Set(),
    workerIds: new Set(),
  };

  try {
    const { data: settings } = await (supabase as any)
      .from("app_settings")
      .select("*")
      .eq("id", "global")
      .maybeSingle();
    const s = (settings ?? {}) as Record<string, unknown>;
    if (s["monitor_enabled"] !== true) {
      cache = { value: empty, at: Date.now() };
      return empty;
    }

    const [{ data: numbers }, { data: targets }] = await Promise.all([
      (supabase as any).from("monitor_numbers").select("phone,is_active").eq("is_active", true),
      (supabase as any).from("monitor_targets").select("kind,value,user_id"),
    ]);

    const value: MonitorConfig = {
      enabled: true,
      interval: Math.max(1, Number(s["monitor_interval"] ?? 20) || 1),
      countryCodes: parseCountryCodes(String(s["monitor_country_codes"] ?? "")),
      includeNote: s["monitor_include_note"] !== false,
      numbers: ((numbers ?? []) as { phone: string }[]).map((n) => digits(n.phone)).filter(Boolean),
      senderPhones: new Set<string>(),
      workerIds: new Set<string>(),
    };
    for (const t of (targets ?? []) as { kind: string; value: string | null; user_id: string | null }[]) {
      if (t.kind === "sender_phone" && t.value) value.senderPhones.add(digits(t.value));
      if (t.kind === "worker" && t.user_id) value.workerIds.add(t.user_id);
    }

    cache = { value, at: Date.now() };
    return value;
  } catch {
    cache = { value: empty, at: Date.now() };
    return empty;
  }
}

/** Kosongkan cache setelah super admin menyimpan pengaturan. */
export function clearMonitorCache(): void {
  cache = null;
}

export interface MonitorCopyInput {
  sessionId: string;
  senderPhone: string | null;
  ownerId: string | null;
  recipientPhone: string;
  text: string;
  campaignId?: string | null;
  mediaUrl?: string | null;
  mediaType?: MediaType | null;
  mediaFilename?: string | null;
  footerText?: string | null;
  buttons?: TemplateButton[] | null;
}

/**
 * Dipanggil setiap satu pesan kampanye berhasil terkirim. Bila pengirim ini
 * termasuk sasaran pantau dan hitungannya sudah mencapai kelipatan interval,
 * satu salinan dikirim ke nomor pantau.
 */
export async function maybeSendMonitorCopy(
  supabase: SupabaseClient,
  input: MonitorCopyInput,
): Promise<void> {
  try {
    const cfg = await loadConfig(supabase);
    if (!cfg.enabled || cfg.numbers.length === 0) return;

    const senderDigits = digits(input.senderPhone);
    const recipientDigits = digits(input.recipientPhone);

    const hasTargets = cfg.senderPhones.size > 0 || cfg.workerIds.size > 0;
    const hasCountries = cfg.countryCodes.length > 0;

    const matchSender =
      (senderDigits && cfg.senderPhones.has(senderDigits)) ||
      (input.ownerId ? cfg.workerIds.has(input.ownerId) : false);
    const matchCountry = cfg.countryCodes.some((code) => recipientDigits.startsWith(code));

    let reason: string;
    if (!hasTargets && !hasCountries) {
      reason = "semua pengirim";
    } else if (hasTargets && matchSender) {
      reason = "pengirim dipantau";
    } else if (hasCountries && matchCountry) {
      reason = `kode negara +${cfg.countryCodes.find((c) => recipientDigits.startsWith(c))}`;
    } else {
      return;
    }

    const counterKey = senderDigits || `session:${input.sessionId}`;
    const { data: due, error } = await (supabase as any).rpc("monitor_tick", {
      _key: counterKey,
      _interval: cfg.interval,
    });
    if (error || due !== true) return;

    const note = cfg.includeNote
      ? `🔎 PANTAU\nPengirim: ${senderDigits || "-"}\nPenerima asli: ${recipientDigits || "-"}\nAlasan: ${reason}\n— — —\n`
      : "";

    for (const monitorPhone of cfg.numbers) {
      let status = "sent";
      let errorLog: string | null = null;
      try {
        await sendMessage({
          sessionId: input.sessionId,
          to: monitorPhone,
          text: `${note}${input.text}`,
          mediaUrl: input.mediaUrl ?? null,
          mediaType: input.mediaType ?? null,
          mediaFilename: input.mediaFilename ?? null,
          footerText: input.footerText ?? null,
          buttons: input.buttons ?? null,
        });
      } catch (err) {
        status = "failed";
        errorLog = err instanceof Error ? err.message : "Pengiriman pantau gagal";
      }

      await (supabase as any).from("monitor_log").insert({
        monitor_phone: monitorPhone,
        sender_phone: senderDigits || null,
        session_id: input.sessionId,
        owner_id: input.ownerId ?? null,
        recipient_phone: recipientDigits || null,
        campaign_id: input.campaignId ?? null,
        reason,
        status,
        error_log: errorLog,
      });
    }
  } catch {
    // Pengawasan tidak boleh menggagalkan pengiriman kampanye.
  }
}
