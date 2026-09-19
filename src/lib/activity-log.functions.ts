/**
 * Server functions untuk log aktivitas.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ActivityRow {
  id: string;
  user_id: string | null;
  actor_role: string;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

async function highestRole(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  return "member";
}

/** Catat aktivitas dari sisi klien (mis. berhasil masuk). */
export const recordActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ action: z.string().min(1).max(80), detail: z.string().max(500).optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await (await import("@/lib/activity-log.server")).logActivity(context.userId, data.action, data.detail ?? null);
    return { ok: true };
  });

/** Daftar aktivitas terbaru, hanya untuk admin/super admin. */
export const listActivityLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActivityRow[]> => {
    const role = await highestRole(context.supabase as any, context.userId);
    if (role === "member") throw new Error("Hanya admin yang dapat melihat log aktivitas.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("activity_log")
      .select("id,user_id,actor_role,actor_email,action,detail,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const logRows = (data ?? []) as Omit<ActivityRow, "actor_name">[];
    const userIds = [...new Set(logRows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))];
    const nameByUserId = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: profiles } = await (supabaseAdmin as any)
        .from("profiles")
        .select("user_id,organization_name")
        .in("user_id", userIds);
      for (const profile of (profiles ?? []) as { user_id: string; organization_name: string | null }[]) {
        const name = profile.organization_name?.trim();
        if (name) nameByUserId.set(profile.user_id, name);
      }
    }

    return logRows.map((row) => ({
      ...row,
      actor_name: row.user_id ? (nameByUserId.get(row.user_id) ?? null) : null,
    }));
  });
