/**
 * Server functions untuk alur MEMBER: status blast, statistik pesan, dan saldo.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MemberDevice {
  id: string;
  session_name: string;
  phone_number: string | null;
  status: string;
}

export interface MemberBlastState {
  running: boolean;
  speed: string;
  max_devices: number;
  devices: MemberDevice[];
  sent: number;
  failed: number;
  pending: number;
  balance: number;
  pool_available: number;
}

export const getBlastState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberBlastState> => {
    const supabase = context.supabase as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const [profileRes, devicesRes, queueRes, balanceRes, settingsRes, poolRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("blast_speed,blast_running")
        .eq("user_id", context.userId)
        .maybeSingle(),
      supabase
        .from("wa_sessions")
        .select("id,session_name,phone_number,status")
        .eq("user_id", context.userId)
        .order("created_at"),
      supabase.from("message_queue").select("status").eq("user_id", context.userId).limit(100000),
      supabase.rpc("reward_balance", { _user_id: context.userId }),
      admin.from("app_settings").select("max_devices_per_member").eq("id", "global").maybeSingle(),
      admin
        .from("message_queue")
        .select("id", { count: "exact", head: true })
        .eq("pool", true)
        .is("claimed_by", null)
        .eq("status", "pending"),
    ]);

    let sent = 0;
    let failed = 0;
    let pending = 0;
    for (const row of (queueRes.data ?? []) as { status: string }[]) {
      if (row.status === "sent") sent += 1;
      else if (row.status === "failed") failed += 1;
      else pending += 1;
    }

    return {
      running: Boolean(profileRes.data?.blast_running),
      speed: profileRes.data?.blast_speed ?? "santai",
      max_devices: settingsRes.data?.max_devices_per_member ?? 4,
      devices: (devicesRes.data ?? []) as MemberDevice[],
      sent,
      failed,
      pending,
      balance: Number(balanceRes.data ?? 0),
      pool_available: Number((poolRes as any)?.count ?? 0),
    };
  });

/** Mulai / hentikan blast dan simpan pilihan kecepatan. */
export const setBlastState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { running: boolean; speed: string }) => ({
    running: Boolean(input.running),
    speed: String(input.speed ?? "santai"),
  }))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { error } = await supabase
      .from("profiles")
      .update({ blast_running: data.running, blast_speed: data.speed })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    const { logActivity } = await import("@/lib/activity-log.server");
    await logActivity(
      context.userId,
      data.running ? "blast_start" : "blast_pause",
      `Kecepatan ${data.speed}`,
    );
    return { ok: true, running: data.running, speed: data.speed };
  });
