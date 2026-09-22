/**
 * REM OTOMATIS kecepatan blast (opsional, dinyalakan admin di Pengaturan > Kecepatan Blast).
 *
 * Dipanggil tiap putaran cron blast-devices. Bila dalam 10 menit terakhir terjadi terlalu banyak
 * "Koneksi perangkat terputus saat mengirim" (tanda WhatsApp menolak laju pengiriman), preset
 * kecepatan diturunkan SATU tingkat (Brutal → Cepat → Normal → Slow). Setelah mengerem, rem
 * menunggu 15 menit sebelum boleh mengerem lagi, supaya efek penurunan sempat terlihat.
 * Rem tidak pernah menaikkan kecepatan; menaikkan kembali selalu keputusan admin.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BLAST_PRESETS,
  columnsToValues,
  isBlastPresetId,
  matchPreset,
  saferPreset,
  valuesToColumns,
} from "@/lib/blast-presets";

const BRAKE_COOLDOWN_MS = 15 * 60_000;
const CHECK_EVERY_MS = 60_000;
let lastCheck = 0;

export async function maybeAutoBrake(supabase: SupabaseClient): Promise<void> {
  if (Date.now() - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = Date.now();

  const { data: row, error } = await supabase.from("app_settings").select("*").eq("id", "global").maybeSingle();
  if (error || !row) return;
  const cfg = row as Record<string, unknown>;
  if (!cfg["blast_auto_brake"]) return;

  const last = cfg["blast_auto_brake_last"] ? new Date(String(cfg["blast_auto_brake_last"])).getTime() : 0;
  if (last && Date.now() - last < BRAKE_COOLDOWN_MS) return;

  const threshold = Math.max(1, Number(cfg["blast_auto_brake_threshold"] ?? 10) || 10);
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count, error: countError } = await supabase
    .from("message_queue")
    .select("id", { count: "exact", head: true })
    .ilike("error_log", "Koneksi perangkat terputus saat mengirim%")
    .gte("scheduled_at", since);
  if (countError || (count ?? 0) <= threshold) return;

  const values = columnsToValues(cfg);
  const stored = cfg["blast_speed_preset"];
  const current = isBlastPresetId(stored) && matchPreset(values) === stored ? stored : matchPreset(values);
  const next = saferPreset(current);
  if (!next) return; // sudah paling aman

  const { error: updateError } = await supabase
    .from("app_settings")
    .update({
      ...valuesToColumns(BLAST_PRESETS[next].values),
      blast_speed_preset: next,
      blast_auto_brake_last: new Date().toISOString(),
      blast_speed_updated_at: new Date().toISOString(),
      blast_speed_updated_by: `rem otomatis (${count} koneksi terputus / 10 menit)`,
    })
    .eq("id", "global");
  if (updateError) {
    console.error("[rem-otomatis] gagal menurunkan kecepatan:", updateError.message);
    return;
  }
  console.log(
    `[rem-otomatis] ${count} koneksi terputus dalam 10 menit (ambang ${threshold}): kecepatan diturunkan ` +
      `${current === "kustom" ? "Kustom" : BLAST_PRESETS[current].label} → ${BLAST_PRESETS[next].label}`,
  );
}
