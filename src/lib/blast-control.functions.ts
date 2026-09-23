/**
 * Server functions admin untuk KENDALI dan PEMANTAUAN blast:
 *  - pengaturan kecepatan (preset Slow–Brutal, parameter, rem otomatis) — ubah: super admin
 *  - Monitor Blast (satu panggilan fungsi database + status sesi gateway) — baca: admin
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BLAST_PRESETS,
  columnsToValues,
  isBlastPresetId,
  matchPreset,
  validateSpeedValues,
  valuesToColumns,
  type BlastPresetOrCustom,
  type BlastSpeedValues,
} from "@/lib/blast-presets";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface BlastSpeedSettings {
  preset: BlastPresetOrCustom;
  values: BlastSpeedValues;
  autoBrake: boolean;
  autoBrakeThreshold: number;
  autoBrakeLast: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  /** false bila migrasi 027 belum dijalankan (kolom preset/rem belum ada). */
  migrated: boolean;
}

export interface BlastMonitorBlaster {
  phone: string;
  sent_60m: number;
  sent_10m: number;
  median_sec: number | null;
  last_sent: string | null;
  mode: string | null;
  blast_ready: boolean | null;
  device_status: string | null;
  cooldown_until: string | null;
  last_ping: string | null;
  worker: string;
  total_sent: number;
  /** Pemilik nomor & perangkat terakhir yang dipakai (untuk pop up detail worker). */
  worker_id: string | null;
  session_id: string | null;
}


export interface BlastMonitor {
  now: string;
  settings: {
    preset: string;
    min_delay_sec: number | null;
    max_delay_sec: number | null;
    hourly_cap: number | null;
    daily_cap: number | null;
    warmup_count: number;
    auto_brake: boolean;
    auto_brake_last: string | null;
  };
  totals: {
    sent_10m: number;
    sent_60m: number;
    senders_10m: number;
    senders_60m: number;
    pending: number;
    pending_ready: number;
    processing: number;
    retrying: number;
  };
  devices: {
    ready_db: number;
    active_5m: number;
    cooling: number;
    ready_unique_phones: number;
    connected_db: number;
  };
  errors: Partial<
    Record<
      "terputus" | "belum_siap" | "ditolak_463" | "ditahan" | "tidak_pasti" | "gateway" | "lainnya" | "ditolak_mapan",
      number
    >
  >;
  report: {
    mapan_aktif: number;
    pemanasan_aktif: number;
    rata_mapan_per_menit: number | null;
    rata_pemanasan_per_menit: number | null;
  };
  minutes: { m: string; sent: number; senders: number }[];
  blasters: BlastMonitorBlaster[];
  campaigns: { id: string; name: string; pending: number; sent: number; failed: number }[];
  gateway: Record<string, number> | null;
  gatewayError: string | null;
}

async function requireAdmin(context: any, superOnly = false): Promise<void> {
  const { assertAdminRole } = await import("@/lib/admin-guard.server");
  await assertAdminRole(context.userId, superOnly);
}

async function actorEmail(userId: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

function toSettings(row: Record<string, unknown> | null): BlastSpeedSettings {
  const values = columnsToValues(row);
  const stored = row?.["blast_speed_preset"];
  const matched = matchPreset(values);
  return {
    // Preset tersimpan hanya dipercaya bila nilainya memang sama; selain itu "kustom".
    preset: isBlastPresetId(stored) && matched === stored ? stored : matched,
    values,
    autoBrake: Boolean(row?.["blast_auto_brake"]),
    autoBrakeThreshold: Number(row?.["blast_auto_brake_threshold"] ?? 10) || 10,
    autoBrakeLast: (row?.["blast_auto_brake_last"] as string | null) ?? null,
    updatedAt: (row?.["blast_speed_updated_at"] as string | null) ?? null,
    updatedBy: (row?.["blast_speed_updated_by"] as string | null) ?? null,
    migrated: Boolean(row && "blast_speed_preset" in row),
  };
}

/** Baca pengaturan kecepatan blast. Admin & super admin. */
export const getBlastSpeedSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BlastSpeedSettings> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("app_settings")
      .select("*")
      .eq("id", "global")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return toSettings((data ?? null) as Record<string, unknown> | null);
  });

/** Simpan pengaturan kecepatan blast. Hanya super admin. Berlaku di pengirim dalam ±1 menit. */
export const saveBlastSpeedSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { values: BlastSpeedValues; autoBrake: boolean; autoBrakeThreshold: number }) => {
      const v = input?.values ?? ({} as BlastSpeedValues);
      const values: BlastSpeedValues = {
        minDelaySec: Number(v.minDelaySec),
        maxDelaySec: Number(v.maxDelaySec),
        hourlyCap: Number(v.hourlyCap),
        dailyCap: Number(v.dailyCap),
        warmupCount: Number(v.warmupCount),
        warmupMinSec: Number(v.warmupMinSec),
        warmupMaxSec: Number(v.warmupMaxSec),
        maxDevicesPerNumber: Number(v.maxDevicesPerNumber),
      };
      const problem = validateSpeedValues(values);
      if (problem) throw new Error(problem);
      const threshold = Number(input?.autoBrakeThreshold);
      if (!Number.isInteger(threshold) || threshold < 1 || threshold > 1000) {
        throw new Error("Ambang rem otomatis harus bilangan bulat 1–1000.");
      }
      return { values, autoBrake: Boolean(input?.autoBrake), autoBrakeThreshold: threshold };
    },
  )
  .handler(async ({ data, context }): Promise<BlastSpeedSettings> => {
    await requireAdmin(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const preset = matchPreset(data.values);
    const email = await actorEmail(context.userId);
    const { data: saved, error } = await admin
      .from("app_settings")
      .update({
        ...valuesToColumns(data.values),
        blast_speed_preset: preset,
        blast_auto_brake: data.autoBrake,
        blast_auto_brake_threshold: data.autoBrakeThreshold,
        blast_speed_updated_at: new Date().toISOString(),
        blast_speed_updated_by: email ?? context.userId,
      })
      .eq("id", "global")
      .select("*")
      .maybeSingle();
    if (error) {
      if (/column .* does not exist|schema cache/i.test(error.message)) {
        throw new Error("Migrasi 027 belum dijalankan di database. Jalankan SQL 027 dulu.");
      }
      throw new Error(error.message);
    }
    const label = preset === "kustom" ? "Kustom" : BLAST_PRESETS[preset].label;
    await (await import("@/lib/activity-log.server")).logActivity(
      context.userId,
      "blast_speed_update",
      `Kecepatan blast diubah ke ${label} (jeda ${data.values.minDelaySec}–${data.values.maxDelaySec} dtk, ` +
        `${data.values.hourlyCap}/jam, ${data.values.dailyCap}/hari, rem otomatis ${data.autoBrake ? "aktif" : "mati"})`,
    );
    return toSettings((saved ?? null) as Record<string, unknown> | null);
  });

/** Data Monitor Blast. Admin & super admin. */
export const getBlastMonitor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BlastMonitor> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("admin_blast_monitor");
    if (error) {
      if (/function .*admin_blast_monitor|does not exist|schema cache/i.test(error.message)) {
        throw new Error("Migrasi 027 belum dijalankan di database. Jalankan SQL 027 dulu.");
      }
      throw new Error(error.message);
    }
    const monitor = data as Omit<BlastMonitor, "gateway" | "gatewayError">;

    // Lengkapi setiap baris blaster dengan pemilik & perangkat, supaya baris tabel
    // di Monitor Blast bisa dibuka menjadi pop up detail worker.
    try {
      const phones = Array.from(new Set((monitor.blasters ?? []).map((b) => b.phone).filter(Boolean)));
      if (phones.length) {
        const { data: sessions } = await (supabaseAdmin as any)
          .from("wa_sessions")
          .select("id,user_id,phone_number,updated_at")
          .in("phone_number", phones)
          .order("updated_at", { ascending: false });
        const byPhone = new Map<string, { id: string; user_id: string }>();
        for (const s of (sessions ?? []) as { id: string; user_id: string; phone_number: string }[]) {
          if (!byPhone.has(s.phone_number)) byPhone.set(s.phone_number, { id: s.id, user_id: s.user_id });
        }
        monitor.blasters = (monitor.blasters ?? []).map((b) => {
          const match = byPhone.get(b.phone);
          return {
            ...b,
            worker_id: b.worker_id ?? match?.user_id ?? null,
            session_id: b.session_id ?? match?.id ?? null,
          };
        });
      }
    } catch {
      // Tanpa pemetaan ini monitor tetap tampil, hanya pop up detail yang tidak tersedia.
    }

    let gateway: Record<string, number> | null = null;
    let gatewayError: string | null = null;
    try {
      const { gatewaySessionCounts } = await import("@/lib/wa-gateway.server");
      gateway = await gatewaySessionCounts();
    } catch (err) {
      gatewayError = err instanceof Error ? err.message : String(err);
    }
    return { ...monitor, gateway, gatewayError };
  });

