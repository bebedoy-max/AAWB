/**
 * Server functions untuk konsol admin (flow lengkap: pengguna, kampanye,
 * data nomor, laporan, tim admin). Semua pemeriksaan hak akses di server.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AppRole = "super_admin" | "admin" | "member";

export interface AdminUserRow {
  user_id: string;
  name: string;
  email: string;
  role: AppRole;
  balance: number;
  pending_withdrawal: number;
  devices_total: number;
  devices_online: number;
  devices_working: number;
  sent: number;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface AdminUsersResult {
  rows: AdminUserRow[];
  total_devices: number;
  devices_online: number;
  devices_working: number;
  balance_total: number;
  pending_total: number;
}

export interface TargetRow {
  id: string;
  campaign_id: string;
  campaign_name: string;
  recipient_phone: string;
  status: string;
  claimed: boolean;
  created_at: string;
  sent_at: string | null;
}

export interface TargetsResult {
  rows: TargetRow[];
  total: number;
  ready: number;
  sent: number;
  failed: number;
}

export interface ReportRow {
  id: string;
  sender: string;
  sender_owner: string;
  recipient_phone: string;
  message_body: string;
  status: string;
  error_log: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ReportResult {
  rows: ReportRow[];
  sent: number;
  failed: number;
  ready: number;
}

export interface CampaignOption {
  id: string;
  name: string;
}

async function rolesOf(_supabase: any, userId: string): Promise<AppRole[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
}

function highest(roles: AppRole[]): AppRole {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  return "member";
}

async function assertAdmin(context: any, superOnly = false): Promise<AppRole> {
  const role = highest(await rolesOf(context.supabase, context.userId));
  if (superOnly ? role !== "super_admin" : role === "member") {
    throw new Error(
      superOnly
        ? "Hanya super admin yang dapat melakukan tindakan ini."
        : "Hanya admin yang dapat melakukan tindakan ini.",
    );
  }
  return role;
}

async function loadDirectory(admin: any) {
  const [{ data: users }, { data: roleRows }, { data: profileRows }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("user_roles").select("user_id,role"),
    admin.from("profiles").select("user_id,organization_name"),
  ]);

  const roleMap = new Map<string, AppRole[]>();
  for (const r of (roleRows ?? []) as { user_id: string; role: AppRole }[]) {
    roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
  }
  const nameMap = new Map<string, string>();
  for (const p of (profileRows ?? []) as { user_id: string; organization_name: string | null }[]) {
    if (p.organization_name) nameMap.set(p.user_id, p.organization_name);
  }
  return { users: (users?.users ?? []) as any[], roleMap, nameMap };
}

function displayName(u: any, nameMap: Map<string, string>): string {
  return (
    nameMap.get(u.id) ??
    ((u.user_metadata?.["organization_name"] ??
      u.user_metadata?.["full_name"] ??
      u.user_metadata?.["name"]) as string | undefined) ??
    (u.email ? (String(u.email).split("@")[0] ?? "—") : "—")
  );
}

/** Semua pengguna member beserta saldo, perangkat, dan statistik pengiriman. */
export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUsersResult> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { users, roleMap, nameMap } = await loadDirectory(admin);

    const [{ data: sessions }, { data: ledger }, { data: withdrawals }, { data: queue }] =
      await Promise.all([
        admin.from("wa_sessions").select("id,user_id,status"),
        admin.from("reward_ledger").select("user_id,amount").limit(200000),
        admin.from("withdrawals").select("user_id,amount,status").limit(20000),
        admin.from("message_queue").select("user_id,status,sent_at").limit(200000),
      ]);

    const devices = new Map<string, { total: number; online: number }>();
    for (const s of (sessions ?? []) as any[]) {
      const e = devices.get(s.user_id) ?? { total: 0, online: 0 };
      e.total += 1;
      if (s.status === "connected") e.online += 1;
      devices.set(s.user_id, e);
    }

    const earned = new Map<string, number>();
    for (const l of (ledger ?? []) as any[]) {
      earned.set(l.user_id, (earned.get(l.user_id) ?? 0) + Number(l.amount ?? 0));
    }

    const paid = new Map<string, number>();
    const pending = new Map<string, number>();
    for (const w of (withdrawals ?? []) as any[]) {
      const amount = Number(w.amount ?? 0);
      if (w.status === "approved") paid.set(w.user_id, (paid.get(w.user_id) ?? 0) + amount);
      if (w.status === "pending") pending.set(w.user_id, (pending.get(w.user_id) ?? 0) + amount);
    }

    const twoMinAgo = Date.now() - 2 * 60 * 1000;
    const sentBy = new Map<string, number>();
    const workingBy = new Map<string, number>();
    for (const q of (queue ?? []) as any[]) {
      if (q.status === "sent") sentBy.set(q.user_id, (sentBy.get(q.user_id) ?? 0) + 1);
      if (q.sent_at && new Date(q.sent_at).getTime() > twoMinAgo) {
        workingBy.set(q.user_id, (workingBy.get(q.user_id) ?? 0) + 1);
      }
    }

    const rows: AdminUserRow[] = users
      .map((u) => {
        const role = highest(roleMap.get(u.id) ?? []);
        const d = devices.get(u.id) ?? { total: 0, online: 0 };
        const balance =
          (earned.get(u.id) ?? 0) - (paid.get(u.id) ?? 0) - (pending.get(u.id) ?? 0);
        return {
          user_id: u.id,
          name: displayName(u, nameMap),
          email: u.email ?? "(tanpa email)",
          role,
          balance,
          pending_withdrawal: pending.get(u.id) ?? 0,
          devices_total: d.total,
          devices_online: d.online,
          devices_working: workingBy.get(u.id) ? 1 : 0,
          sent: sentBy.get(u.id) ?? 0,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    return {
      rows,
      total_devices: rows.reduce((s, r) => s + r.devices_total, 0),
      devices_online: rows.reduce((s, r) => s + r.devices_online, 0),
      devices_working: rows.reduce((s, r) => s + r.devices_working, 0),
      balance_total: rows.reduce((s, r) => s + r.balance, 0),
      pending_total: rows.reduce((s, r) => s + r.pending_withdrawal, 0),
    };
  });

/** Daftar admin & super admin (tim manajer). */
export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { users, roleMap, nameMap } = await loadDirectory(admin);
    return users
      .map((u) => ({
        user_id: u.id,
        name: displayName(u, nameMap),
        email: u.email ?? "(tanpa email)",
        role: highest(roleMap.get(u.id) ?? []),
        created_at: u.created_at,
      }))
      .filter((u) => u.role !== "member")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  });

/** Kandidat pengguna yang bisa diangkat menjadi admin. */
export const listPromotableUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { users, roleMap, nameMap } = await loadDirectory(admin);
    return users
      .map((u) => ({
        user_id: u.id,
        name: displayName(u, nameMap),
        email: u.email ?? "(tanpa email)",
        role: highest(roleMap.get(u.id) ?? []),
      }))
      .filter((u) => u.role === "member");
  });

/** Pilihan kampanye untuk filter (semua kampanye admin/kolam). */
export const listCampaignOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CampaignOption[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("campaigns")
      .select("id,name,created_at")
      .eq("is_pool", true)
      .order("created_at", { ascending: false })
      .limit(200);
    return ((data ?? []) as any[]).map((c) => ({ id: c.id, name: c.name }));
  });

/** Daftar nomor target pada kolam kampanye. */
export const listTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId?: string; status?: string }) => ({
    campaignId: input?.campaignId && input.campaignId !== "all" ? String(input.campaignId) : null,
    status: input?.status && input.status !== "all" ? String(input.status) : null,
  }))
  .handler(async ({ data, context }): Promise<TargetsResult> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: campaigns } = await admin
      .from("campaigns")
      .select("id,name")
      .eq("is_pool", true)
      .limit(500);
    const poolCampaigns = (campaigns ?? []) as any[];
    const nameById = new Map(poolCampaigns.map((c) => [c.id, c.name as string]));
    const poolIds = poolCampaigns.map((c) => c.id as string);

    // Hanya nomor milik kampanye kolam admin yang dihitung, agar angka di halaman
    // ini selalu selaras dengan daftar kampanye.
    if (!poolIds.length) return { rows: [], total: 0, ready: 0, sent: 0, failed: 0 };

    let counter = admin.from("message_queue").select("status,claimed_by").limit(200000);
    if (data.campaignId) counter = counter.eq("campaign_id", data.campaignId);
    else counter = counter.in("campaign_id", poolIds);
    const { data: all } = await counter;
    const list = (all ?? []) as any[];

    let query = admin
      .from("message_queue")
      .select("id,campaign_id,recipient_phone,status,claimed_by,created_at,sent_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.campaignId) query = query.eq("campaign_id", data.campaignId);
    else query = query.in("campaign_id", poolIds);
    if (data.status === "ready") query = query.eq("status", "pending");
    else if (data.status) query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return {
      rows: ((rows ?? []) as any[]).map((r) => ({
        id: r.id,
        campaign_id: r.campaign_id,
        campaign_name: nameById.get(r.campaign_id) ?? "—",
        recipient_phone: r.recipient_phone,
        status: r.status,
        claimed: Boolean(r.claimed_by),
        created_at: r.created_at,
        sent_at: r.sent_at,
      })),
      total: list.length,
      ready: list.filter((r) => r.status === "pending" || r.status === "processing").length,
      sent: list.filter((r) => r.status === "sent").length,
      failed: list.filter((r) => r.status === "failed").length,
    };
  });

/** Tambahkan nomor target ke kolam kampanye tertentu. */
export const addTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string; phones: string[] }) => {
    if (!input?.campaignId) throw new Error("Pilih kampanye target terlebih dahulu.");
    const phones = Array.from(
      new Set((input.phones ?? []).map((p) => String(p).replace(/\D/g, "")).filter(Boolean)),
    );
    if (!phones.length) throw new Error("Tidak ada nomor yang valid.");
    if (phones.length > 50000) throw new Error("Maksimal 50.000 nomor sekali tambah.");
    return { campaignId: String(input.campaignId), phones };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: campaign, error: cErr } = await admin
      .from("campaigns")
      .select("id,message_body,total_targets")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Kampanye tidak ditemukan.");

    const { data: existing } = await admin
      .from("message_queue")
      .select("recipient_phone")
      .eq("campaign_id", data.campaignId)
      .limit(200000);
    const known = new Set(((existing ?? []) as any[]).map((r) => r.recipient_phone));
    const fresh = data.phones.filter((p) => !known.has(p));
    if (!fresh.length) {
      // Bukan kegagalan: semua nomor memang sudah ada. Kembalikan hasil kosong
      // agar UI menampilkan pesan, bukan layar error.
      return { ok: true, added: 0, skipped: data.phones.length };
    }


    const now = new Date().toISOString();
    const rows = fresh.map((phone) => ({
      user_id: context.userId,
      campaign_id: data.campaignId,
      recipient_phone: phone,
      message_body: campaign.message_body ?? "",
      status: "pending",
      pool: true,
      scheduled_at: now,
    }));
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await admin.from("message_queue").insert(rows.slice(i, i + 1000));
      if (error) throw new Error(error.message);
    }

    await admin
      .from("campaigns")
      .update({ total_targets: Number(campaign.total_targets ?? 0) + rows.length })
      .eq("id", data.campaignId);

    const { logActivity } = await import("@/lib/activity-log.server");
    await logActivity(context.userId, "target_add", `${rows.length} nomor ke kampanye ${data.campaignId}`);

    return { ok: true, added: rows.length, skipped: data.phones.length - rows.length };
  });

/** Hapus satu nomor target. */
export const deleteTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("message_queue")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Hapus seluruh nomor target pada kolam kampanye (reset data nomor). */
export const resetTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: campaigns } = await admin
      .from("campaigns")
      .select("id")
      .eq("is_pool", true)
      .limit(500);
    const ids = ((campaigns ?? []) as any[]).map((c) => c.id as string);
    if (!ids.length) return { ok: true, removed: 0 };

    const { count } = await admin
      .from("message_queue")
      .select("id", { count: "exact", head: true })
      .in("campaign_id", ids);

    const { error } = await admin.from("message_queue").delete().in("campaign_id", ids);
    if (error) throw new Error(error.message);
    await admin.from("campaigns").update({ total_targets: 0 }).in("id", ids);

    const { logActivity } = await import("@/lib/activity-log.server");
    await logActivity(context.userId, "target_reset", `${count ?? 0} nomor dihapus`);
    return { ok: true, removed: Number(count ?? 0) };
  });

/** Laporan pengiriman per kampanye. */
export const listReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId?: string }) => ({
    campaignId: input?.campaignId && input.campaignId !== "all" ? String(input.campaignId) : null,
  }))
  .handler(async ({ data, context }): Promise<ReportResult> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    let query = admin
      .from("message_queue")
      .select("id,session_id,user_id,recipient_phone,message_body,status,error_log,sent_at,created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.campaignId) query = query.eq("campaign_id", data.campaignId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const { data: sessions } = await admin
      .from("wa_sessions")
      .select("id,session_name,phone_number");
    const sessionById = new Map(((sessions ?? []) as any[]).map((s) => [s.id, s]));

    const { users, nameMap } = await loadDirectory(admin);
    const userById = new Map(users.map((u) => [u.id, displayName(u, nameMap)]));

    const list = (rows ?? []) as any[];
    return {
      rows: list.map((r) => {
        const s = r.session_id ? sessionById.get(r.session_id) : null;
        return {
          id: r.id,
          sender: s ? (s.phone_number ?? s.session_name) : "—",
          sender_owner: userById.get(r.user_id) ?? "—",
          recipient_phone: r.recipient_phone,
          message_body: r.message_body ?? "",
          status: r.status,
          error_log: r.error_log ?? null,
          sent_at: r.sent_at,
          created_at: r.created_at,
        };
      }),
      sent: list.filter((r) => r.status === "sent").length,
      failed: list.filter((r) => r.status === "failed").length,
      ready: list.filter((r) => r.status === "pending" || r.status === "processing").length,
    };
  });

/** Hentikan paksa seluruh blast: kampanye dijeda dan mesin member dimatikan. */
export const stopAllBlast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { error } = await admin
      .from("campaigns")
      .update({ status: "paused" })
      .eq("status", "running");
    if (error) throw new Error(error.message);
    await admin.from("profiles").update({ blast_running: false }).eq("blast_running", true);
    await admin.from("wa_sessions").update({ blast_ready: false }).eq("blast_ready", true);
    const { logActivity } = await import("@/lib/activity-log.server");
    await logActivity(context.userId, "blast_stop_all", "Seluruh blast dihentikan admin");
    return { ok: true };
  });
