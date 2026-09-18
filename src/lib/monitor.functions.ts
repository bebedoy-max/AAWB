/**
 * Server functions untuk alur ADMIN: monitoring real-time dan proyek blast
 * (kolam nomor yang dikerjakan perangkat member).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buttonToken } from "@/lib/whatsapp";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AdminOverview {
  members: number;
  devices_total: number;
  devices_connected: number;
  devices_working: number;
  sent_total: number;
  failed_total: number;
  pending_total: number;
  pool_unclaimed: number;
  sent_last_minute: number;
  earnings_total: number;
  withdrawal_pending: number;
  withdrawal_paid: number;
}

export interface DeviceMonitorRow {
  id: string;
  session_name: string;
  phone_number: string | null;
  status: string;
  owner_email: string;
  sent: number;
  failed: number;
  working: boolean;
  last_activity: string | null;
}

export interface BlastProjectRow {
  id: string;
  name: string;
  message_body: string;
  media_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  total_targets: number;
  sent: number;
  failed: number;
  pending: number;
  created_at: string;
  status: string;
}

/** Pisahkan CTA yang disimpan di akhir pesan ("\n\nTeks: https://…"). */
function splitCta(body: string): { message: string; cta_text: string | null; cta_url: string | null } {
  const token = body.match(/^([\s\S]*?)\n*\[\[tombol:([^|\]]+)\|([^\]]+)\]\]\s*$/i);
  if (token) {
    return {
      message: (token[1] ?? body).trim(),
      cta_text: token[2]?.trim() || null,
      cta_url: token[3]?.trim() || null,
    };
  }
  const m = body.match(/^([\s\S]*?)\n\n([^\n]*?):?\s*(https?:\/\/\S+)\s*$/);
  if (!m) return { message: body, cta_text: null, cta_url: null };
  return { message: m[1] ?? body, cta_text: m[2] || null, cta_url: m[3] ?? null };
}

/** Gabungkan pesan + CTA menjadi satu body pesan. */
function joinCta(message: string, ctaText?: string | null, ctaUrl?: string | null): string {
  const url = (ctaUrl ?? "").trim();
  if (!url) return message;
  const link = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const text = (ctaText ?? "").trim();
  return `${message}\n\n${buttonToken(text || "Buka Tautan", link)}`;
}

async function rolesOf(_supabase: any, userId: string): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return ((data ?? []) as { role: string }[]).map((r) => r.role);
}

async function assertAdmin(context: any): Promise<void> {
  const roles = await rolesOf(context.supabase, context.userId);
  if (!roles.includes("admin") && !roles.includes("super_admin")) {
    throw new Error("Hanya admin yang dapat membuka halaman ini.");
  }
}

const EMPTY: AdminOverview = {
  members: 0,
  devices_total: 0,
  devices_connected: 0,
  devices_working: 0,
  sent_total: 0,
  failed_total: 0,
  pending_total: 0,
  pool_unclaimed: 0,
  sent_last_minute: 0,
  earnings_total: 0,
  withdrawal_pending: 0,
  withdrawal_paid: 0,
};

/** Ringkasan monitoring untuk dasbor admin. */
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    await assertAdmin(context);
    const { data, error } = await (context.supabase as any).rpc("admin_overview");
    if (error) throw new Error(error.message);
    const overview = { ...EMPTY, ...((data ?? {}) as Partial<AdminOverview>) };

    // Perangkat harus mengikuti pengguna yang masih ada. Bersihkan sesi milik
    // akun yang sudah dihapus, lalu hitung ulang dari data bersih tersebut.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;
      const [{ data: users }, { data: sessions }] = await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        admin.from("wa_sessions").select("id,user_id,status"),
      ]);
      const alive = new Set<string>(((users as any)?.users ?? []).map((u: any) => u.id));
      const rows = ((sessions ?? []) as any[]).filter((s) => alive.has(s.user_id));
      const orphans = ((sessions ?? []) as any[])
        .filter((s) => !alive.has(s.user_id))
        .map((s) => s.id);
      if (orphans.length) await admin.from("wa_sessions").delete().in("id", orphans);

      overview.devices_total = rows.length;
      overview.devices_connected = rows.filter((s) => s.status === "connected").length;
      if (overview.devices_working > overview.devices_connected) {
        overview.devices_working = overview.devices_connected;
      }
    } catch {
      // biarkan nilai dari RPC bila pembersihan gagal
    }

    return overview;
  });

/** Semua perangkat member beserta aktivitas terakhirnya. */
export const getDeviceMonitor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DeviceMonitorRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const [{ data: sessions }, { data: queue }, users] = await Promise.all([
      admin.from("wa_sessions").select("id,user_id,session_name,phone_number,status").order("created_at"),
      admin.from("message_queue").select("session_id,status,sent_at").not("session_id", "is", null).limit(50000),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }).catch(() => ({ data: { users: [] } })),
    ]);

    const emails = new Map<string, string>();
    for (const u of (users as any)?.data?.users ?? []) emails.set(u.id, u.email ?? "");

    const stats = new Map<string, { sent: number; failed: number; last: string | null }>();
    for (const row of (queue ?? []) as any[]) {
      const entry = stats.get(row.session_id) ?? { sent: 0, failed: 0, last: null };
      if (row.status === "sent") entry.sent += 1;
      if (row.status === "failed") entry.failed += 1;
      if (row.sent_at && (!entry.last || row.sent_at > entry.last)) entry.last = row.sent_at;
      stats.set(row.session_id, entry);
    }

    const twoMinAgo = Date.now() - 2 * 60 * 1000;
    return ((sessions ?? []) as any[]).map((s) => {
      const entry = stats.get(s.id) ?? { sent: 0, failed: 0, last: null };
      return {
        id: s.id,
        session_name: s.session_name,
        phone_number: s.phone_number,
        status: s.status,
        owner_email: emails.get(s.user_id) ?? "—",
        sent: entry.sent,
        failed: entry.failed,
        working: Boolean(entry.last && new Date(entry.last).getTime() > twoMinAgo),
        last_activity: entry.last,
      };
    });
  });

/** Daftar proyek blast (kolam) beserta progresnya. */
export const listBlastProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BlastProjectRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: projects, error } = await admin
      .from("campaigns")
      .select("id,name,message_body,media_url,buttons_json,total_targets,status,created_at")
      .eq("is_pool", true)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const ids = ((projects ?? []) as any[]).map((p) => p.id);
    const counts = new Map<string, { sent: number; failed: number; pending: number }>();
    if (ids.length) {
      const { data: queue } = await admin
        .from("message_queue")
        .select("campaign_id,status")
        .in("campaign_id", ids)
        .limit(100000);
      for (const row of (queue ?? []) as any[]) {
        const entry = counts.get(row.campaign_id) ?? { sent: 0, failed: 0, pending: 0 };
        if (row.status === "sent") entry.sent += 1;
        else if (row.status === "failed") entry.failed += 1;
        else entry.pending += 1;
        counts.set(row.campaign_id, entry);
      }
    }

    return ((projects ?? []) as any[]).map((p) => {
      const legacy = splitCta(p.message_body ?? "");
      const storedButton = Array.isArray(p.buttons_json)
        ? p.buttons_json.find((button: unknown) => {
            if (!button || typeof button !== "object") return false;
            const value = button as Record<string, unknown>;
            return typeof value["text"] === "string" && typeof value["url"] === "string";
          }) as { text: string; url: string } | undefined
        : undefined;
      return {
        id: p.id,
        name: p.name,
        message_body: legacy.message,
        media_url: p.media_url ?? null,
        cta_text: storedButton?.text ?? legacy.cta_text,
        cta_url: storedButton?.url ?? legacy.cta_url,
        total_targets: p.total_targets ?? 0,
        created_at: p.created_at,
        status: p.status,
        ...(counts.get(p.id) ?? { sent: 0, failed: 0, pending: 0 }),
      };
    });
  });

/** Buat proyek blast baru: pesan + daftar nomor yang sudah diformat. */
export const createBlastProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      message: string;
      phones: string[];
      mediaUrl?: string | null;
      ctaText?: string | null;
      ctaUrl?: string | null;
    }) => {
      const name = (input.name ?? "").trim() || "Proyek tanpa nama";
      const base = (input.message ?? "").trim();
      if (!base) throw new Error("Pesan kampanye tidak boleh kosong.");
      const ctaUrl = (input.ctaUrl ?? "").trim();
      const normalizedCtaUrl = ctaUrl
        ? (/^https?:\/\//i.test(ctaUrl) ? ctaUrl : `https://${ctaUrl}`)
        : null;
      const buttons = normalizedCtaUrl
        ? [{ text: (input.ctaText ?? "").trim() || "Buka Tautan", url: normalizedCtaUrl }]
        : [];
      const mediaUrl = (input.mediaUrl ?? "").trim() || null;
      const phones = Array.from(
        new Set((input.phones ?? []).map((p) => String(p).replace(/\D/g, "")).filter(Boolean)),
      );
      if (phones.length > 50000) throw new Error("Maksimal 50.000 nomor per proyek.");
      return { name, message: base, phones, mediaUrl, buttons };
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: project, error } = await admin
      .from("campaigns")
      .insert({
        user_id: context.userId,
        name: data.name,
        message_body: data.message,
        media_url: data.mediaUrl,
        media_type: data.mediaUrl ? "image" : "text",
        buttons_json: data.buttons,
        is_pool: true,
        status: data.phones.length ? "running" : "draft",
        total_targets: data.phones.length,
        min_delay: 1,
        max_delay: 1,
        batch_limit: 100000,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const now = new Date().toISOString();
    const rows = data.phones.map((phone) => ({
      user_id: context.userId,
      campaign_id: project.id,
      recipient_phone: phone,
      message_body: data.message,
      status: "pending",
      pool: true,
      scheduled_at: now,
    }));

    for (let i = 0; i < rows.length; i += 1000) {
      const { error: insertError } = await admin.from("message_queue").insert(rows.slice(i, i + 1000));
      if (insertError) throw new Error(insertError.message);
    }

    const { logActivity } = await import("@/lib/activity-log.server");
    await logActivity(context.userId, "project_create", `${data.name} — ${rows.length} nomor`);

    return { ok: true, id: project.id as string, queued: rows.length, status: data.phones.length ? "running" : "draft" };
  });

/** Ubah konten proyek blast (judul, pesan, poster, CTA). */
export const updateBlastProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      name: string;
      message: string;
      mediaUrl?: string | null;
      ctaText?: string | null;
      ctaUrl?: string | null;
    }) => {
      const name = (input.name ?? "").trim() || "Proyek tanpa nama";
      const base = (input.message ?? "").trim();
      if (!base) throw new Error("Pesan kampanye tidak boleh kosong.");
      return {
        id: String(input.id),
        name,
        message: base,
        mediaUrl: (input.mediaUrl ?? "").trim() || null,
        buttons: (() => {
          const url = (input.ctaUrl ?? "").trim();
          if (!url) return [];
          return [{
            text: (input.ctaText ?? "").trim() || "Buka Tautan",
            url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
          }];
        })(),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { error } = await admin
      .from("campaigns")
      .update({
        name: data.name,
        message_body: data.message,
        media_url: data.mediaUrl,
        media_type: data.mediaUrl ? "image" : "text",
        buttons_json: data.buttons,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Sinkronkan pesan ke antrean yang belum terkirim.
    await admin
      .from("message_queue")
      .update({ message_body: data.message })
      .eq("campaign_id", data.id)
      .eq("status", "pending");

    const { logActivity } = await import("@/lib/activity-log.server");
    await logActivity(context.userId, "project_update", data.name);
    return { ok: true };
  });

/** Hapus proyek blast beserta antrean pesannya. */
export const deleteBlastProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    await admin.from("message_queue").delete().eq("campaign_id", data.id);
    const { error } = await admin.from("campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    const { logActivity } = await import("@/lib/activity-log.server");
    await logActivity(context.userId, "project_delete", data.id);
    return { ok: true };
  });

/** Hentikan / lanjutkan proyek blast. */
export const setProjectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "running" | "paused" }) => ({
    id: String(input.id),
    status: input.status === "paused" ? ("paused" as const) : ("running" as const),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { error } = await admin.from("campaigns").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, status: data.status };
  });
