/**
 * Server functions untuk fitur Nomor Pantau (khusus super admin).
 * Semua akses memakai klien server berhak penuh setelah peran diperiksa.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminRole } from "@/lib/admin-guard.server";

const MIGRATION_HINT =
  "Fitur Nomor Pantau belum aktif. Jalankan db/migrations/029_nomor_pantau.sql di SQL Editor Supabase.";

function wrap(error: { message: string } | null): void {
  if (!error) return;
  if (/monitor_(numbers|targets|log|counters|enabled|interval|country_codes|include_note|all_enabled|all_interval)|monitor_tick/.test(error.message)) {
    throw new Error(MIGRATION_HINT);
  }
  throw new Error(error.message);
}

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export interface MonitorNumberRow {
  id: string;
  phone: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
}

export interface MonitorLogRow {
  id: string;
  monitor_phone: string;
  sender_phone: string | null;
  recipient_phone: string | null;
  reason: string | null;
  status: string;
  error_log: string | null;
  created_at: string;
}

export interface MonitorSettings {
  enabled: boolean;
  interval: number;
  country_codes: string;
  include_note: boolean;
  all_enabled: boolean;
  all_interval: number;
}

export interface MonitorOverview {
  settings: MonitorSettings;
  numbers: MonitorNumberRow[];
  log: MonitorLogRow[];
}

/** Semua data panel Nomor Pantau dalam satu permintaan. */
export const getMonitorOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MonitorOverview> => {
    await assertAdminRole(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: s, error: sErr } = await admin
      .from("app_settings")
      .select("*")
      .eq("id", "global")
      .maybeSingle();
    if (sErr) wrap(sErr);

    const [numbers, log] = await Promise.all([
      admin.from("monitor_numbers").select("*").order("created_at", { ascending: true }),
      admin.from("monitor_log").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    wrap(numbers.error ?? null);
    wrap(log.error ?? null);

    const row = (s ?? {}) as Record<string, unknown>;
    return {
      settings: {
        enabled: row["monitor_enabled"] === true,
        interval: Math.max(1, Number(row["monitor_interval"] ?? 20) || 20),
        country_codes: String(row["monitor_country_codes"] ?? ""),
        include_note: row["monitor_include_note"] !== false,
        all_enabled: row["monitor_all_enabled"] === true,
        all_interval: Math.max(1, Number(row["monitor_all_interval"] ?? 50) || 50),
      },
      numbers: (numbers.data ?? []) as MonitorNumberRow[],
      log: (log.data ?? []) as MonitorLogRow[],
    };
  });

/** Simpan pengaturan umum pantau. */
export const saveMonitorSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean; interval: number; countryCodes: string; includeNote: boolean; allEnabled?: boolean; allInterval?: number }) => {
    const interval = Math.trunc(Number(input?.interval));
    if (!Number.isFinite(interval) || interval < 1 || interval > 10_000) {
      throw new Error("Jumlah pesan harus antara 1 dan 10.000.");
    }
    const allInterval = Math.trunc(Number(input?.allInterval ?? 50));
    if (!Number.isFinite(allInterval) || allInterval < 1 || allInterval > 10_000) {
      throw new Error("Jumlah pesan untuk semua workers harus antara 1 dan 10.000.");
    }
    return {
      allEnabled: Boolean(input?.allEnabled),
      allInterval,
      enabled: Boolean(input?.enabled),
      interval,
      countryCodes: String(input?.countryCodes ?? "")
        .split(/[\s,;]+/)
        .map((c) => c.replace(/\D/g, ""))
        .filter(Boolean)
        .join(","),
      includeNote: input?.includeNote !== false,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdminRole(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("app_settings").upsert(
      {
        id: "global",
        monitor_enabled: data.enabled,
        monitor_interval: data.interval,
        monitor_country_codes: data.countryCodes,
        monitor_include_note: data.includeNote,
        monitor_all_enabled: data.allEnabled,
        monitor_all_interval: data.allInterval,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    wrap(error);
    const { clearMonitorCache } = await import("@/lib/monitor-copy.server");
    clearMonitorCache();
    return { ok: true };
  });

/** Tambah nomor pantau. */
export const addMonitorNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string; label?: string }) => {
    const phone = digits(input?.phone);
    if (phone.length < 8) throw new Error("Nomor pantau tidak valid.");
    return { phone, label: String(input?.label ?? "").trim() || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdminRole(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("monitor_numbers")
      .upsert({ phone: data.phone, label: data.label, is_active: true }, { onConflict: "phone" });
    wrap(error);
    const { clearMonitorCache } = await import("@/lib/monitor-copy.server");
    clearMonitorCache();
    return { ok: true };
  });

/** Aktif/nonaktifkan satu nomor pantau. */
export const toggleMonitorNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; active: boolean }) => {
    if (!input?.id) throw new Error("Nomor tidak valid.");
    return { id: String(input.id), active: Boolean(input.active) };
  })
  .handler(async ({ data, context }) => {
    await assertAdminRole(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("monitor_numbers")
      .update({ is_active: data.active })
      .eq("id", data.id);
    wrap(error);
    const { clearMonitorCache } = await import("@/lib/monitor-copy.server");
    clearMonitorCache();
    return { ok: true };
  });

/** Hapus nomor pantau. */
export const deleteMonitorNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Nomor tidak valid.");
    return { id: String(input.id) };
  })
  .handler(async ({ data, context }) => {
    await assertAdminRole(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("monitor_numbers").delete().eq("id", data.id);
    wrap(error);
    const { clearMonitorCache } = await import("@/lib/monitor-copy.server");
    clearMonitorCache();
    return { ok: true };
  });

/** Hapus seluruh riwayat salinan pantau. */
export const clearMonitorLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminRole(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("monitor_log").delete().not("id", "is", null);
    wrap(error);
    return { ok: true };
  });
