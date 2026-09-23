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
  filtered: number;
  page: number;
  pageSize: number;
}

export interface ReportRow {
  id: string;
  campaign_id: string;
  campaign_name: string;
  user_id: string;
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

/** Ambil SEMUA akun Auth (daftar dipecah 1000 per halaman). */
async function listAllAuthUsers(admin: any): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const batch = (data?.users ?? []) as any[];
    all.push(...batch);
    if (batch.length < 1000) break;
  }
  return all;
}

async function loadDirectory(admin: any) {
  const [users, { data: roleRows }, { data: profileRows }] = await Promise.all([
    listAllAuthUsers(admin),
    admin.from("user_roles").select("user_id,role").limit(200000),
    admin.from("profiles").select("user_id,organization_name").limit(200000),
  ]);

  const roleMap = new Map<string, AppRole[]>();
  for (const r of (roleRows ?? []) as { user_id: string; role: AppRole }[]) {
    roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
  }
  const nameMap = new Map<string, string>();
  for (const p of (profileRows ?? []) as { user_id: string; organization_name: string | null }[]) {
    if (p.organization_name) nameMap.set(p.user_id, p.organization_name);
  }
  return { users, roleMap, nameMap };
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
/** Masa berlaku permintaan ganti email: 3 menit. */
export const EMAIL_CHANGE_TTL_MS = 3 * 60 * 1000;

async function hashEmailChangeState(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createEmailChangeState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { users, roleMap, nameMap } = await loadDirectory(admin);
    const now = Date.now();

    const rows = users.map((u) => {
      const email = (u.email ?? "") as string;
      const meta = (u.user_metadata ?? {}) as Record<string, any>;
      const requestedAt = meta["email_change_requested_at"]
        ? Date.parse(String(meta["email_change_requested_at"]))
        : NaN;
      const requestedEmail = String(meta["email_change_target"] ?? "").trim().toLowerCase();
      const rawPending = (u.new_email ?? null) as string | null;
      // Auth kadang masih mengembalikan new_email sesaat setelah tautan dipakai.
      // Email akun yang sudah sama dengan target adalah bukti perubahan selesai.
      const completed = Boolean(requestedEmail) && email.trim().toLowerCase() === requestedEmail;
      // Permintaan dianggap kedaluwarsa bila lewat 3 menit (atau tidak punya
      // catatan waktu sama sekali).
      const expired =
        Boolean(rawPending) && !completed &&
        (!Number.isFinite(requestedAt) || now - requestedAt > EMAIL_CHANGE_TTL_MS);
      const pending = expired || completed ? null : rawPending;
      const isPlaceholder = !email || email.endsWith("@member.aawb.local");
      return {
        user_id: u.id,
        name: displayName(u, nameMap),
        email: email || "(tanpa email)",
        role: highest(roleMap.get(u.id) ?? []),
        created_at: u.created_at,
        pending_email: pending,
        expires_at:
          pending && Number.isFinite(requestedAt)
            ? new Date(requestedAt + EMAIL_CHANGE_TTL_MS).toISOString()
            : null,
        // Hanya "menunggu verifikasi" bila memang ada permintaan ganti email
        // yang belum dikonfirmasi pemiliknya dan belum kedaluwarsa.
        email_pending: Boolean(pending),
        email_verified: !pending,
        needs_real_email: isPlaceholder,
        _expired: expired,
        _completed: completed,
        _currentEmail: email,
      };
    });

    // Bersihkan permintaan yang sudah kedaluwarsa (best-effort).
    await Promise.all(
      rows
        .filter((r) => (r._expired || r._completed) && r._currentEmail)
        .map(async (r) => {
          try {
            await admin.auth.admin.updateUserById(r.user_id, {
              email: r._currentEmail,
              email_confirm: true,
               user_metadata: {
                 email_change_requested_at: null,
                 email_change_target: null,
                 email_change_state_hash: null,
               },
            });
          } catch {
            /* abaikan, status tetap dianggap kedaluwarsa di UI */
          }
        }),
    );

    return rows
      .map(({ _expired, _completed, _currentEmail, ...r }) => r)
      .filter((u) => u.role !== "member")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  });

/**
 * Minta perubahan email AKUN SENDIRI (admin / super admin).
 * Supabase mengirim tautan verifikasi ke alamat baru lewat SMTP proyek.
 * Email lama tetap berlaku sampai tautan itu dibuka pemilik alamat baru.
 */
export const requestStaffEmailChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; email: string; origin?: string }) => {
    if (!input?.userId) throw new Error("Pengguna tidak valid.");
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Format email tidak valid.");
    if (email.endsWith("@member.aawb.local")) throw new Error("Gunakan email asli, bukan email internal.");
    const origin = String(input.origin ?? "").trim();
    return { userId: input.userId, email, origin: /^https?:\/\//.test(origin) ? origin : "" };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; sent: boolean; pending_email: string; expires_at: string }> => {
      await assertAdmin(context);

      if (data.userId !== context.userId) {
        throw new Error("Anda hanya bisa mengubah email akun Anda sendiri.");
      }

      const { getRequest } = await import("@tanstack/react-start/server");
      const token = (getRequest()?.headers.get("authorization") ?? "").replace("Bearer ", "");
      if (!token) throw new Error("Sesi tidak ditemukan. Silakan masuk ulang.");

      const url = process.env["MY_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
      const apikey =
        process.env["MY_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
      if (!url || !apikey) throw new Error("Konfigurasi Supabase tidak lengkap.");

      const emailChangeState = createEmailChangeState();
      const emailChangeStateHash = await hashEmailChangeState(emailChangeState);
      const redirectUrl = data.origin ? new URL("/verifikasi", data.origin) : null;
      if (redirectUrl) {
        redirectUrl.searchParams.set("email_change_user", context.userId);
        redirectUrl.searchParams.set("email_change_state", emailChangeState);
      }
      const redirectTo = redirectUrl?.toString() ?? "";
      const endpoint = `${url.replace(/\/$/, "")}/auth/v1/user${
        redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ""
      }`;

      const res = await fetch(endpoint, {
        method: "PUT",
        headers: {
          apikey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: data.email }),
      });

      const bodyText = await res.text();

      if (!res.ok) {
        console.error(`[email_change] ${res.status}: ${bodyText}`);
        let msg = "Gagal mengirim tautan verifikasi.";
        try {
          const parsed = JSON.parse(bodyText);
          msg = parsed.msg || parsed.message || parsed.error_description || msg;
        } catch {
          /* biarkan pesan default */
        }
        if (res.status === 429) {
          msg = "Terlalu sering meminta tautan. Tunggu beberapa menit lalu coba lagi.";
        }
        throw new Error(msg);
      }

      // Pastikan permintaan benar-benar tercatat di Auth (new_email terisi).
      let pendingEmail = "";
      try {
        pendingEmail = String(JSON.parse(bodyText)?.new_email ?? "");
      } catch {
        /* abaikan */
      }
      if (!pendingEmail) {
        throw new Error(
          "Permintaan ganti email tidak tercatat. Pastikan pengiriman email (SMTP) aktif di Auth.",
        );
      }

      const requestedAt = new Date().toISOString();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      try {
        await (supabaseAdmin as any).auth.admin.updateUserById(context.userId, {
          user_metadata: {
            email_change_requested_at: requestedAt,
            email_change_target: data.email,
             email_change_state_hash: emailChangeStateHash,
          },
        });
      } catch (e) {
        console.error("[email_change] gagal menyimpan waktu permintaan", e);
      }

      await (await import("@/lib/activity-log.server")).logActivity(
        context.userId,
        "email_change",
        `Permintaan ganti email sendiri ke ${data.email} (menunggu verifikasi)`,
      );

      return {
        ok: true,
        sent: true,
        pending_email: pendingEmail,
        expires_at: new Date(Date.parse(requestedAt) + EMAIL_CHANGE_TTL_MS).toISOString(),
      };
    },
  );

/**
 * Menyelesaikan perubahan setelah pemilik alamat baru membuka tautan email.
 * State acak di tautan hanya disimpan sebagai hash dan sekali pakai.
 */
export const finalizeStaffEmailChange = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string; state: string }) => {
    const userId = String(input?.userId ?? "").trim();
    const state = String(input?.state ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f]{64}$/i.test(state)) {
      throw new Error("Tautan verifikasi tidak valid.");
    }
    return { userId, state };
  })
  .handler(async ({ data }): Promise<{ ok: true; email: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: found, error } = await (supabaseAdmin as any).auth.admin.getUserById(data.userId);
    if (error || !found?.user) throw new Error("Akun tidak ditemukan.");

    const user = found.user;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const target = String(meta["email_change_target"] ?? "").trim().toLowerCase();
    const requestedAt = Date.parse(String(meta["email_change_requested_at"] ?? ""));
    const expectedHash = String(meta["email_change_state_hash"] ?? "");
    const receivedHash = await hashEmailChangeState(data.state);

    if (!target || !expectedHash || expectedHash !== receivedHash) {
      throw new Error("Tautan verifikasi tidak valid atau sudah pernah dipakai.");
    }
    if (!Number.isFinite(requestedAt) || Date.now() - requestedAt > EMAIL_CHANGE_TTL_MS) {
      throw new Error("Tautan verifikasi sudah kedaluwarsa. Minta email baru.");
    }

    const currentEmail = String(user.email ?? "").trim().toLowerCase();
    const pendingEmail = String(user.new_email ?? "").trim().toLowerCase();
    if (currentEmail !== target && pendingEmail !== target) {
      throw new Error("Alamat pada tautan tidak cocok dengan perubahan yang diminta.");
    }

    const { error: updateError } = await (supabaseAdmin as any).auth.admin.updateUserById(data.userId, {
      email: target,
      email_confirm: true,
      user_metadata: {
        email_change_requested_at: null,
        email_change_target: null,
        email_change_state_hash: null,
      },
    });
    if (updateError) throw new Error(updateError.message);

    return { ok: true, email: target };
  });


/**
 * Kirim tautan ganti kata sandi ke email AKUN SENDIRI (admin / super admin).
 */
export const requestStaffPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; origin?: string }) => {
    if (!input?.userId) throw new Error("Pengguna tidak valid.");
    const origin = String(input.origin ?? "").trim();
    return { userId: input.userId, origin: /^https?:\/\//.test(origin) ? origin : "" };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; email: string }> => {
    await assertAdmin(context);
    if (data.userId !== context.userId) {
      throw new Error("Anda hanya bisa mengubah kata sandi akun Anda sendiri.");
    }

    const url = process.env["MY_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
    const apikey =
      process.env["MY_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
    if (!url || !apikey) throw new Error("Konfigurasi Supabase tidak lengkap.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: found, error } = await (supabaseAdmin as any).auth.admin.getUserById(
      context.userId,
    );
    if (error) throw new Error(error.message);
    const email = String(found?.user?.email ?? "");
    if (!email || email.endsWith("@member.aawb.local")) {
      throw new Error("Akun ini belum memakai email asli. Ubah email dulu.");
    }

    const redirectTo = data.origin ? `${data.origin}/ganti-sandi` : "";
    const res = await fetch(
      `${url.replace(/\/$/, "")}/auth/v1/recover${
        redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ""
      }`,
      {
        method: "POST",
        headers: { apikey, Authorization: `Bearer ${apikey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(`[password_reset] ${res.status}: ${text}`);
      let msg = "Gagal mengirim tautan ganti kata sandi.";
      try {
        const parsed = JSON.parse(text);
        msg = parsed.msg || parsed.message || parsed.error_description || msg;
      } catch {
        /* pesan default */
      }
      if (res.status === 429) msg = "Terlalu sering meminta tautan. Tunggu beberapa menit.";
      throw new Error(msg);
    }

    await (await import("@/lib/activity-log.server")).logActivity(
      context.userId,
      "password_reset",
      `Permintaan ganti kata sandi dikirim ke ${email}`,
    );

    return { ok: true, email };
  });

/** Ubah nama tampilan akun sendiri (admin / super admin). */
export const updateStaffName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) => {
    const name = String(input?.name ?? "").trim();
    if (name.length < 2 || name.length > 100) {
      throw new Error("Nama harus 2-100 karakter.");
    }
    return { name };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; name: string }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("profiles")
      .update({ organization_name: data.name })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    await (await import("@/lib/activity-log.server")).logActivity(
      context.userId,
      "profile_update",
      `Nama tampilan diubah menjadi ${data.name}`,
    );

    return { ok: true, name: data.name };
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
  .inputValidator((input: { campaignId?: string; status?: string; page?: number }) => ({
    campaignId: input?.campaignId && input.campaignId !== "all" ? String(input.campaignId) : null,
    status: input?.status && input.status !== "all" ? String(input.status) : null,
    page: Math.max(1, Math.floor(Number(input?.page) || 1)),
  }))
  .handler(async ({ data, context }): Promise<TargetsResult> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const PAGE_SIZE = 20;

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
    if (!poolIds.length)
      return { rows: [], total: 0, ready: 0, sent: 0, failed: 0, filtered: 0, page: 1, pageSize: PAGE_SIZE };

    // Statistik dihitung lewat count exact sehingga seluruh data (tanpa batas)
    // ikut terhitung, bukan hanya baris yang termuat.
    const scope = () => {
      let q = admin.from("message_queue").select("*", { count: "exact", head: true });
      q = data.campaignId ? q.eq("campaign_id", data.campaignId) : q.in("campaign_id", poolIds);
      return q;
    };
    const byStatus = (q: any) => {
      if (data.status === "ready") return q.eq("status", "pending");
      if (data.status) return q.eq("status", data.status);
      return q;
    };

    const [tot, rdy, snt, fld, filt] = await Promise.all([
      scope(),
      scope().in("status", ["pending", "processing"]),
      scope().eq("status", "sent"),
      scope().eq("status", "failed"),
      byStatus(scope()),
    ]);

    let query = admin
      .from("message_queue")
      .select("id,campaign_id,recipient_phone,status,claimed_by,created_at,sent_at")
      .order("created_at", { ascending: false });
    if (data.campaignId) query = query.eq("campaign_id", data.campaignId);
    else query = query.in("campaign_id", poolIds);
    if (data.status === "ready") query = query.eq("status", "pending");
    else if (data.status) query = query.eq("status", data.status);

    const filtered = filt.count ?? 0;
    const pageCount = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
    const page = Math.min(data.page, pageCount);
    const from = (page - 1) * PAGE_SIZE;
    const { data: rows, error } = await query.range(from, from + PAGE_SIZE - 1);
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
      total: tot.count ?? 0,
      ready: rdy.count ?? 0,
      sent: snt.count ?? 0,
      failed: fld.count ?? 0,
      filtered,
      page,
      pageSize: PAGE_SIZE,
    };
  });

/** Tambahkan nomor target ke kolam kampanye tertentu. */
export const addTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string; phones: string[] }) => {
    if (!input?.campaignId) throw new Error("Pilih kampanye target terlebih dahulu.");
    // Nomor dobel TIDAK dibuang di sini: kampanye mode test boleh memakai nomor
    // yang sama berkali-kali (nomor dev). Penyaringan dilakukan di handler.
    const phones = (input.phones ?? []).map((p) => String(p).replace(/\D/g, "")).filter(Boolean);
    if (!phones.length) throw new Error("Tidak ada nomor yang valid.");
    return { campaignId: String(input.campaignId), phones };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: campaign, error: cErr } = await admin
      .from("campaigns")
      .select("id,message_body,total_targets,test_mode")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Kampanye tidak ditemukan.");

    const isTest = campaign.test_mode === true;

    let fresh: string[];
    if (isTest) {
      // Mode test: nomor boleh diulang sebanyak yang diinginkan.
      fresh = data.phones;
    } else {
      const unique = Array.from(new Set(data.phones));
      const { data: existing } = await admin
        .from("message_queue")
        .select("recipient_phone")
        .eq("campaign_id", data.campaignId)
        .limit(200000);
      const known = new Set(((existing ?? []) as any[]).map((r) => r.recipient_phone));
      fresh = unique.filter((p) => !known.has(p));
    }
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

    // Pembersihan otomatis: riwayat selesai (terkirim/gagal) yang umurnya sudah
    // lebih dari 3 bulan dihapus. Tidak ada penghapusan manual lagi.
    {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      await admin
        .from("message_queue")
        .delete()
        .in("status", ["sent", "failed"])
        .lt("created_at", cutoff);
    }

    // Catatan: pesan macet di "processing" TIDAK lagi ditandai gagal di sini. Dulu pembersihan ini
    // memakai waktu baris DIBUAT (bukan waktu diproses) dan hanya jalan saat laporan dibuka, sehingga
    // pesan yang sedang berjalan ikut ditandai gagal. Sekarang ditangani sapuan terjadwal
    // (sweep_stale_processing) yang mengembalikan pesan ke antrean untuk dikirim ulang.

    // Kampanye mode test TIDAK pernah masuk laporan riwayat pengiriman.
    const { data: testRows } = await admin.from("campaigns").select("id").eq("test_mode", true);
    const testIds = new Set<string>(((testRows ?? []) as any[]).map((c) => String(c.id)));
    if (data.campaignId && testIds.has(data.campaignId)) {
      return { rows: [], sent: 0, failed: 0, ready: 0 };
    }

    // Ambil SELURUH baris tanpa batas: penarikan bertahap per 1.000 baris
    // sampai habis, karena database memotong maksimal 1.000 per permintaan.
    // Laporan harus mencakup semua data, bukan hanya 1.000 terbaru.
    const selectCols =
      "id,campaign_id,session_id,user_id,claimed_by,recipient_phone,message_body,status,error_log,sent_at,created_at,sender_phone";
    //
    // PERBAIKAN baris dobel (21 Sep 2026): dulu diurutkan HANYA dengan created_at, padahal ribuan
    // baris satu kampanye dibuat dalam satu insert sehingga created_at-nya identik. Urutan baris
    // yang nilainya sama tidak dijamin tetap antar-permintaan, jadi satu baris bisa terambil di dua
    // halaman (tampil dobel) dan baris lain terlewat. Ditambah lagi, filter status "processing" di
    // query membuat isi halaman bergeser saat kampanye berjalan. Sekarang:
    //  - urutan selalu unik: created_at, lalu id sebagai pemutus seri;
    //  - hanya status akhir (terkirim/gagal) yang diambil, lihat catatan di bawah;
    //  - hasil diduplikasi-hapus berdasarkan id sebagai pengaman terakhir.
    //
    // Laporan HANYA berisi hasil akhir (terkirim atau gagal). Pesan yang masih menunggu tidak
    // ditarik baris per baris (bisa ratusan ribu); jumlahnya dihitung langsung di database.
    // Himpunan terkirim/gagal hanya bertambah selama pengambilan, sehingga pergeseran halaman
    // paling-paling menghasilkan baris ganda, dan itu disaring lewat id.
    const PAGE = 1000;
    const byId = new Map<string, any>();
    for (let from = 0; ; from += PAGE) {
      let query = admin
        .from("message_queue")
        .select(selectCols)
        .in("status", ["sent", "failed"])
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE - 1);
      if (data.campaignId) query = query.eq("campaign_id", data.campaignId);
      const { data: chunk, error } = await query;
      if (error) throw new Error(error.message);
      for (const r of (chunk ?? []) as any[]) if (!byId.has(r.id)) byId.set(r.id, r);
      if (!chunk || chunk.length < PAGE) break;
    }
    const rows: any[] = [...byId.values()].filter(
      (r) =>
        (r.status === "sent" || r.status === "failed") &&
        !(r.campaign_id && testIds.has(String(r.campaign_id))),
    );

    // Jumlah pesan yang masih menunggu: dihitung di database, tanpa menarik barisnya.
    let pendingQuery = admin
      .from("message_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (data.campaignId) pendingQuery = pendingQuery.eq("campaign_id", data.campaignId);
    else if (testIds.size)
      pendingQuery = pendingQuery.or(
        `campaign_id.is.null,campaign_id.not.in.(${[...testIds].join(",")})`,
      );
    const { count: pendingCount, error: pendingError } = await pendingQuery;
    if (pendingError) throw new Error(pendingError.message);


    const { data: sessions } = await admin
      .from("wa_sessions")
      .select("id,user_id,session_name,phone_number,status,updated_at");
    const sessionList = (sessions ?? []) as any[];
    const sessionById = new Map(sessionList.map((s) => [s.id, s]));
    // Untuk data lama yang belum menyimpan perangkat pengirim: pakai nomor
    // perangkat milik pengirim (utamakan yang tersambung dan terbaru).
    const sessionByUser = new Map<string, any>();
    for (const s of [...sessionList].sort((a, b) => {
      const rank = (x: any) => (x.status === "connected" ? 0 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
    })) {
      if (s.user_id && s.phone_number && !sessionByUser.has(s.user_id)) sessionByUser.set(s.user_id, s);
    }

    const campaignIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.campaign_id).filter(Boolean)));
    const { data: campaignRows } = campaignIds.length
      ? await admin.from("campaigns").select("id,name").in("id", campaignIds)
      : { data: [] };
    const campaignById = new Map(((campaignRows ?? []) as any[]).map((c) => [c.id, c.name]));

    const { users, nameMap } = await loadDirectory(admin);
    const userById = new Map(users.map((u) => [u.id, displayName(u, nameMap)]));

    const list = (rows ?? []) as any[];
    return {
      rows: list.map((r) => {
        const s =
          (r.session_id ? sessionById.get(r.session_id) : null) ??
          sessionByUser.get(r.claimed_by ?? r.user_id) ??
          null;
        return {
          id: r.id,
          campaign_id: r.campaign_id,
          campaign_name: campaignById.get(r.campaign_id) ?? r.campaign_id,
          user_id: r.user_id,
          // Utamakan nomor yang tersimpan di baris pesan (tetap ada walau sesi
          // perangkat sudah terhapus), lalu data sesi sebagai cadangan.
          sender:
            r.sender_phone ??
            (s ? (s.phone_number ?? (/^\d+$/.test(s.session_name ?? "") ? s.session_name : null)) : null) ??
            "—",
          // Nama pengirim harus mengikuti pemilik perangkat yang benar-benar
          // mengirim pesan, bukan pemilik kampanye/admin yang membuat antrean.
          sender_owner:
            userById.get(r.claimed_by ?? s?.user_id ?? r.user_id) ?? "—",
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
      ready: Number(pendingCount ?? 0),

    };
  });

/** Hapus seluruh riwayat pengiriman (status terkirim/gagal); antrean aktif tidak disentuh. */
export const clearReportHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    // 1) riwayat selesai (terkirim/gagal) selalu dihapus
    const { error } = await admin.from("message_queue").delete().in("status", ["sent", "failed"]);
    if (error) throw new Error(error.message);
    // 2) antrean menunggu milik kampanye yang TIDAK sedang berjalan ikut dibersihkan
    const { data: runningRows } = await admin
      .from("campaigns")
      .select("id")
      .eq("status", "running");
    const runningIds: string[] = (runningRows ?? []).map((r: any) => r.id);
    let pendingDel = admin.from("message_queue").delete().eq("status", "pending");
    if (runningIds.length > 0) {
      pendingDel = pendingDel.not("campaign_id", "in", `(${runningIds.join(",")})`);
    }
    const { error: pendingError } = await pendingDel;
    if (pendingError) throw new Error(pendingError.message);
    const { logActivity } = await import("@/lib/activity-log.server");
    await logActivity(context.userId, "report_clear", "Riwayat pengiriman dihapus admin");
    return { ok: true };
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
