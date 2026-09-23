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
  if (/monitor_(numbers|targets|log|counters|enabled|interval|country_codes|include_note)|monitor_tick/.test(error.message)) {
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

export interface MonitorTargetRow {
  id: string;
  kind: "sender_phone" | "worker";
  value: string | null;
  user_id: string | null;
  label: string | null;
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
}

export interface MonitorOverview {
  settings: MonitorSettings;
  numbers: MonitorNumberRow[];
  targets: MonitorTargetRow[];
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

    const [numbers, targets, log] = await Promise.all([
      admin.from("monitor_numbers").select("*").order("created_at", { ascending: true }),
      admin.from("monitor_targets").select("*").order("created_at", { ascending: true }),
      admin.from("monitor_log").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    wrap(numbers.error ?? null);
    wrap(targets.error ?? null);
    wrap(log.error ?? null);

    const row = (s ?? {}) as Record<string, unknown>;
    return {
      settings: {
        enabled: row["monitor_enabled"] === true,
        interval: Math.max(1, Number(row["monitor_interval"] ?? 20) || 20),
        country_codes: String(row["monitor_country_codes"] ?? ""),
        include_note: row["monitor_include_note"] !== false,
      },
      numbers: (numbers.data ?? []) as MonitorNumberRow[],
      targets: (targets.data ?? []) as MonitorTargetRow[],
      log: (log.data ?? []) as MonitorLogRow[],
    };
  });

/** Simpan pengaturan umum pantau. */
export const saveMonitorSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean; interval: number; countryCodes: string; includeNote: boolean }) => {
    const interval = Math.trunc(Number(input?.interval));
    if (!Number.isFinite(interval) || interval < 1 || interval > 10_000) {
      throw new Error("Jumlah pesan harus antara 1 dan 10.000.");
    }
    return {
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

/** Tambah sasaran: nomor pengirim atau worker. */
export const addMonitorTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: "sender_phone" | "worker"; value?: string; userId?: string; label?: string }) => {
    if (input?.kind === "sender_phone") {
      const phone = digits(input?.value);
      if (phone.length < 8) throw new Error("Nomor pengirim tidak valid.");
      return { kind: "sender_phone" as const, value: phone, userId: null, label: String(input?.label ?? "").trim() || null };
    }
    if (input?.kind === "worker") {
      if (!input?.userId) throw new Error("Worker belum dipilih.");
      return { kind: "worker" as const, value: null, userId: String(input.userId), label: String(input?.label ?? "").trim() || null };
    }
    throw new Error("Jenis sasaran tidak valid.");
  })
  .handler(async ({ data, context }) => {
    await assertAdminRole(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("monitor_targets").insert({
      kind: data.kind,
      value: data.value,
      user_id: data.userId,
      label: data.label,
    });
    if (error && /duplicate key/i.test(error.message)) throw new Error("Sasaran ini sudah ada.");
    wrap(error);
    const { clearMonitorCache } = await import("@/lib/monitor-copy.server");
    clearMonitorCache();
    return { ok: true };
  });

/** Hapus sasaran pantau. */
export const deleteMonitorTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Sasaran tidak valid.");
    return { id: String(input.id) };
  })
  .handler(async ({ data, context }) => {
    await assertAdminRole(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("monitor_targets").delete().eq("id", data.id);
    wrap(error);
    const { clearMonitorCache } = await import("@/lib/monitor-copy.server");
    clearMonitorCache();
    return { ok: true };
  });
