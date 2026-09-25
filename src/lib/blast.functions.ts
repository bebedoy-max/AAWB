/**
 * Server functions blast untuk member:
 *  - getBlastState  : ringkasan status blast milik pengguna (perangkat, hasil kirim, saldo, sisa kolam)
 *  - setBlastState  : saklar Start/Stop blast untuk SEMUA perangkat terhubung milik pengguna
 *  - setDeviceBlast : saklar dan kecepatan blast untuk SATU perangkat
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { speedByValue } from "@/lib/blast-speed";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_DEVICES = 4;

export interface BlastStateDevice {
  id: string;
  session_name: string;
  phone_number: string | null;
  status: string;
  blast_ready: boolean;
  blast_speed: string;
}

export interface BlastState {
  running: boolean;
  speed: string;
  devices: BlastStateDevice[];
  sent: number;
  failed: number;
  balance: number;
  max_devices: number;
  pool_available: number;
}

/** Status blast milik pengguna yang sedang masuk. */
export const getBlastState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BlastState> => {
    const uid = context.userId;
    const supabase = context.supabase as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const [sessionRes, sentRes, failedRes, poolRes, ledgerRes, withdrawRes] = await Promise.all([
      supabase
        .from("wa_sessions")
        .select("id,session_name,phone_number,status,blast_ready,blast_speed")
        .eq("user_id", uid)
        .order("created_at", { ascending: true }),
      admin
        .from("message_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("status", "sent"),
      admin
        .from("message_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("status", "failed"),
      admin.rpc("pool_remaining_running"),
      admin.from("reward_ledger").select("amount").eq("user_id", uid).limit(100000),
      admin.from("withdrawals").select("amount,status").eq("user_id", uid),
    ]);

    const devices: BlastStateDevice[] = ((sessionRes.data ?? []) as any[]).map((d) => ({
      id: String(d.id),
      session_name: String(d.session_name ?? "Perangkat"),
      phone_number: d.phone_number ?? null,
      status: String(d.status ?? "disconnected"),
      blast_ready: Boolean(d.blast_ready),
      blast_speed: speedByValue(d.blast_speed).value,
    }));

    const running = devices.some((d) => d.status === "connected" && d.blast_ready);
    const active = devices.find((d) => d.blast_ready) ?? devices[0];

    const earned = ((ledgerRes.data ?? []) as { amount: number | string }[]).reduce(
      (sum, r) => sum + Number(r.amount ?? 0),
      0,
    );
    const withdrawals = (withdrawRes.data ?? []) as { amount: number | string; status: string }[];
    const spent = withdrawals
      .filter((w) => w.status === "approved" || w.status === "pending")
      .reduce((sum, w) => sum + Number(w.amount ?? 0), 0);

    return {
      running,
      speed: active ? active.blast_speed : speedByValue(null).value,
      devices,
      sent: sentRes.count ?? 0,
      failed: failedRes.count ?? 0,
      balance: earned - spent,
      max_devices: MAX_DEVICES,
      pool_available: Number(poolRes.data ?? 0),
    };
  });

/** Start/Stop blast untuk seluruh perangkat terhubung milik pengguna. */
export const setBlastState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { running: boolean; speed?: string }) => ({
    running: Boolean(input?.running),
    speed: speedByValue(input?.speed).value,
  }))
  .handler(async ({ data, context }): Promise<{ running: boolean; speed: string; devices: number }> => {
    const uid = context.userId;
    const supabase = context.supabase as any;

    const { data: rows, error: readError } = await supabase
      .from("wa_sessions")
      .select("id")
      .eq("user_id", uid)
      .eq("status", "connected");
    if (readError) throw new Error("Perangkat tidak dapat dibaca. Coba lagi sebentar lagi.");

    const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
    if (data.running && ids.length === 0) {
      throw new Error("Hubungkan minimal satu perangkat terlebih dahulu.");
    }

    if (ids.length > 0) {
      const { error } = await supabase
        .from("wa_sessions")
        .update({ blast_ready: data.running, blast_speed: data.speed })
        .in("id", ids);
      if (error) throw new Error("Status blast tidak dapat disimpan. Coba lagi.");
    }

    // Saat dihentikan, perangkat yang tidak terhubung pun ikut dimatikan.
    if (!data.running) {
      await supabase.from("wa_sessions").update({ blast_ready: false }).eq("user_id", uid);
    }

    return { running: data.running, speed: data.speed, devices: ids.length };
  });

/** Saklar dan kecepatan blast untuk satu perangkat. */
export const setDeviceBlast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { session_id: string; ready?: boolean; speed?: string }) => {
    const sessionId = String(input?.session_id ?? "").trim();
    if (!sessionId) throw new Error("Perangkat tidak dikenali.");
    return {
      session_id: sessionId,
      ready: typeof input?.ready === "boolean" ? input.ready : undefined,
      speed: input?.speed ? speedByValue(input.speed).value : undefined,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string; ready: boolean; speed: string }> => {
    const uid = context.userId;
    const supabase = context.supabase as any;

    const { data: row, error: readError } = await supabase
      .from("wa_sessions")
      .select("id,status,blast_ready,blast_speed")
      .eq("id", data.session_id)
      .eq("user_id", uid)
      .maybeSingle();
    if (readError || !row) throw new Error("Perangkat tidak ditemukan.");

    if (data.ready === true && row.status !== "connected") {
      throw new Error("Perangkat belum terhubung.");
    }

    const patch: Record<string, unknown> = {};
    if (data.ready !== undefined) patch["blast_ready"] = data.ready;
    if (data.speed !== undefined) patch["blast_speed"] = data.speed;

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("wa_sessions").update(patch).eq("id", data.session_id);
      if (error) throw new Error("Pengaturan perangkat tidak dapat disimpan.");
    }

    return {
      id: String(row.id),
      ready: data.ready ?? Boolean(row.blast_ready),
      speed: data.speed ?? speedByValue(row.blast_speed).value,
    };
  });
