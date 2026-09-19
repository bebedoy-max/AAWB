/**
 * Server functions untuk peran pengguna dan pengaturan gateway WhatsApp.
 * Semua pemeriksaan hak akses dilakukan di server.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_APP_THEME, isAppThemeId, type AppThemeId } from "@/lib/app-theme";

export type AppRole = "super_admin" | "admin" | "member";

export interface MemberRow {
  user_id: string;
  name: string;
  email: string;
  role: AppRole;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface GatewaySettings {
  url: string;
  api_key_masked: string;
  has_api_key: boolean;
  updated_at: string | null;
}

/**
 * Tema warna global yang aman dibaca publik.
 * Hanya nilai tema dari daftar yang diizinkan yang pernah dikembalikan.
 */
export const getGlobalAppTheme = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ theme: AppThemeId }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("app_settings")
      .select("app_theme")
      .eq("id", "global")
      .maybeSingle();
    // Kolom app_theme mungkin belum ada (migrasi belum dijalankan) -> pakai default.
    if (error) return { theme: DEFAULT_APP_THEME };
    return { theme: isAppThemeId(data?.app_theme) ? data.app_theme : DEFAULT_APP_THEME };
  });

/** Simpan tema warna global. Hanya admin dan super admin. */
export const saveGlobalAppTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { theme: unknown }) => {
    if (!isAppThemeId(input?.theme)) throw new Error("Tema tidak valid.");
    return { theme: input.theme };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("app_settings").upsert(
      {
        id: "global",
        app_theme: data.theme,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "id" },
    );
    if (error) {
      if (/app_theme/.test(error.message)) {
        throw new Error(
          "Penyimpanan tema belum aktif. Jalankan db/migrations/017_global_app_theme.sql di SQL Editor Supabase.",
        );
      }
      throw new Error(error.message);
    }
    return { ok: true, theme: data.theme };
  });

/** Username Telegram customer service (dipakai tombol "Hubungi via Telegram"). */
export const getSupportTelegram = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ username: string | null; url: string | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("app_settings")
      .select("support_telegram_username")
      .eq("id", "global")
      .maybeSingle();
    if (error) return { username: null, url: null };
    const username = (data?.support_telegram_username ?? "").replace(/^@/, "") || null;
    return { username, url: username ? `https://t.me/${username}` : null };
  });

/** Simpan username Telegram customer service. Hanya admin & super admin. */
export const saveSupportTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string }) => ({
    username: (input?.username ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, ""),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.username && !/^[A-Za-z0-9_]{4,32}$/.test(data.username)) {
      throw new Error("Username Telegram tidak valid. Gunakan 4-32 huruf, angka, atau garis bawah.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("app_settings").upsert(
      {
        id: "global",
        support_telegram_username: data.username || null,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "id" },
    );
    if (error) {
      if (/support_telegram_username/.test(error.message)) {
        throw new Error(
          "Fitur ini belum aktif. Jalankan db/migrations/018_support_telegram.sql di SQL Editor Supabase.",
        );
      }
      throw new Error(error.message);
    }
    return { ok: true, username: data.username || null };
  });


/* eslint-disable @typescript-eslint/no-explicit-any */

async function rolesOf(_supabase: any, userId: string): Promise<AppRole[]> {
  // Dibaca dengan akses server penuh agar RLS pada user_roles tidak
  // menyembunyikan peran pengguna sendiri. userId berasal dari token terverifikasi.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
}

function highest(roles: AppRole[]): AppRole {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  return "member";
}

function maskKey(key: string | null | undefined): string {
  if (!key) return "";
  if (key.length <= 6) return "••••••";
  return `${key.slice(0, 3)}••••••${key.slice(-3)}`;
}

/** Peran akun yang sedang masuk. Tabel peran boleh belum dibuat. */
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const roles = await rolesOf(context.supabase as any, context.userId);
      const role = highest(roles);
      return {
        user_id: context.userId,
        role,
        is_admin: role !== "member",
        is_super_admin: role === "super_admin",
        setup_required: false,
      };
    } catch {
      return {
        user_id: context.userId,
        role: "member" as AppRole,
        is_admin: false,
        is_super_admin: false,
        setup_required: true,
      };

    }
  });


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

/** Baca konfigurasi gateway (API key selalu dikembalikan tersamar). */
export const getGatewaySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GatewaySettings> => {
    await assertAdmin(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("app_settings")
      .select("wa_gateway_url,wa_gateway_api_key,updated_at")
      .eq("id", "global")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      url: data?.wa_gateway_url ?? "",
      api_key_masked: maskKey(data?.wa_gateway_api_key),
      has_api_key: Boolean(data?.wa_gateway_api_key),
      updated_at: data?.updated_at ?? null,
    };
  });

/** Simpan URL & API key gateway. API key kosong = biarkan nilai lama. */
export const saveGatewaySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string; apiKey: string; clearApiKey?: boolean }) => {
    const url = (input.url ?? "").trim().replace(/\/+$/, "");
    if (url && !/^https?:\/\//i.test(url)) {
      throw new Error("Alamat gateway harus diawali http:// atau https://");
    }
    return { url, apiKey: (input.apiKey ?? "").trim(), clearApiKey: Boolean(input.clearApiKey) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Record<string, unknown> = {
      id: "global",
      wa_gateway_url: data.url || null,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };
    if (data.clearApiKey) patch["wa_gateway_api_key"] = null;
    else if (data.apiKey) patch["wa_gateway_api_key"] = data.apiKey;

    const { error } = await (supabaseAdmin as any)
      .from("app_settings")
      .upsert(patch, { onConflict: "id" });
    if (error) throw new Error(error.message);
    const { invalidateGatewayConfig } = await import("@/lib/wa-gateway.server");
    invalidateGatewayConfig();
    return { ok: true };
  });


/** Uji koneksi ke gateway dengan konfigurasi tersimpan. */
export const testGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context, true);
    const { pingGateway } = await import("@/lib/wa-gateway.server");
    return pingGateway();
  });

export interface TelegramSettings {
  username: string;
  token_masked: string;
  has_token: boolean;
  active: boolean;
}

/** Baca konfigurasi bot Telegram (token selalu dikembalikan tersamar). */
export const getTelegramSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TelegramSettings> => {
    await assertAdmin(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("app_settings")
      .select("telegram_bot_token,telegram_bot_username")
      .eq("id", "global")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const envToken = process.env["TELEGRAM_BOT_TOKEN"];
    const token = envToken ?? data?.telegram_bot_token ?? null;
    return {
      username: data?.telegram_bot_username ?? "",
      token_masked: maskKey(token),
      has_token: Boolean(token),
      active: Boolean(token),
    };
  });

/** Simpan token & username bot Telegram. Token kosong = biarkan nilai lama. */
export const saveTelegramSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string; username: string; clearToken?: boolean }) => ({
    token: (input?.token ?? "").trim(),
    username: (input?.username ?? "").trim().replace(/^@/, ""),
    clearToken: Boolean(input?.clearToken),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, true);
    if (process.env["TELEGRAM_BOT_TOKEN"]) {
      throw new Error(
        "Token bot sudah diatur lewat environment server, sehingga pengaturan di sini tidak akan dipakai.",
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Record<string, unknown> = {
      id: "global",
      telegram_bot_username: data.username || null,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };
    if (data.clearToken) patch["telegram_bot_token"] = null;
    else if (data.token) patch["telegram_bot_token"] = data.token;

    const { error } = await (supabaseAdmin as any)
      .from("app_settings")
      .upsert(patch, { onConflict: "id" });
    if (error) throw new Error(error.message);
    const { invalidateTelegramConfig } = await import("@/lib/telegram.server");
    invalidateTelegramConfig();
    return { ok: true };
  });

/** Uji token bot Telegram tersimpan dengan memanggil getMe. */
export const testTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context, true);
    const { invalidateTelegramConfig, callTelegram, isTelegramConfigured } = await import(
      "@/lib/telegram.server"
    );
    invalidateTelegramConfig();
    if (!(await isTelegramConfigured())) {
      return { ok: false, message: "Token bot Telegram belum diisi." };
    }
    try {
      const me = await callTelegram<{ username: string; first_name: string }>("getMe");
      return { ok: true, message: `Bot aktif: @${me.username} (${me.first_name})` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  });

/** Daftar semua akun beserta perannya (super admin). */
export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberRow[]> => {
    await assertAdmin(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw new Error(error.message);

    const { data: roleRows } = await (supabaseAdmin as any).from("user_roles").select("user_id,role");
    const { data: profileRows } = await (supabaseAdmin as any)
      .from("profiles")
      .select("user_id,organization_name");
    const nameMap = new Map<string, string>();
    for (const p of (profileRows ?? []) as { user_id: string; organization_name: string | null }[]) {
      if (p.organization_name) nameMap.set(p.user_id, p.organization_name);
    }
    const roleMap = new Map<string, AppRole[]>();
    for (const r of (roleRows ?? []) as { user_id: string; role: AppRole }[]) {
      roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    }

    return users.users
      .filter((u) => highest(roleMap.get(u.id) ?? []) !== "super_admin")
      .map((u) => ({
        user_id: u.id,
        name:
          nameMap.get(u.id) ??
          ((u.user_metadata?.["organization_name"] ??
            u.user_metadata?.["full_name"] ??
            u.user_metadata?.["name"]) as string | undefined) ??
          "—",
        email: u.email ?? "(tanpa email)",
        role: highest(roleMap.get(u.id) ?? []),
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  });

/** Ubah peran seorang anggota (super admin). */
export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: AppRole }) => {
    if (!input?.userId) throw new Error("Pengguna tidak valid.");
    if (!["super_admin", "admin", "member"].includes(input.role)) {
      throw new Error("Peran tidak valid.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context, true);
    if (data.userId === context.userId) {
      throw new Error("Anda tidak dapat mengubah peran akun Anda sendiri.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const targetRoles = await rolesOf(supabaseAdmin as any, data.userId);
    const currentRole = highest(targetRoles);
    if (currentRole === data.role) return { ok: true };

    // Batas keras: maksimal 2 super admin dan 3 admin.
    if (data.role === "super_admin" || data.role === "admin") {
      const { data: allRoles } = await (supabaseAdmin as any)
        .from("user_roles")
        .select("user_id,role")
        .eq("role", data.role);
      const others = ((allRoles ?? []) as { user_id: string }[]).filter(
        (r) => r.user_id !== data.userId,
      ).length;
      const limit = data.role === "super_admin" ? 2 : 3;
      if (others >= limit) {
        throw new Error(
          data.role === "super_admin"
            ? "Kuota Super Admin sudah penuh (maksimal 2). Turunkan salah satu terlebih dahulu."
            : "Kuota Admin sudah penuh (maksimal 3). Turunkan salah satu terlebih dahulu.",
        );
      }
    }
    const del = await (supabaseAdmin as any).from("user_roles").delete().eq("user_id", data.userId);
    if (del.error) throw new Error(del.error.message);
    const ins = await (supabaseAdmin as any)
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (ins.error) throw new Error(ins.error.message);
    await (await import("@/lib/activity-log.server")).logActivity(context.userId, "role_change", `Peran pengguna ${data.userId} diubah menjadi ${data.role}`);
    return { ok: true };
  });

/** Cek ringan: apakah gateway WhatsApp sudah dikonfigurasi (boleh diakses semua user login). */
export const isGatewayConfigured = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ configured: boolean }> => {
    if (process.env["WA_GATEWAY_URL"]) return { configured: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("app_settings")
      .select("wa_gateway_url")
      .eq("id", "global")
      .maybeSingle();
    return { configured: Boolean(data?.wa_gateway_url) };
  });

/** Setel ulang kata sandi seorang anggota (super admin). */
export const resetMemberPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password: string }) => {
    if (!input?.userId) throw new Error("Pengguna tidak valid.");
    const password = (input.password ?? "").trim();
    if (password.length < 8) throw new Error("Kata sandi baru minimal 8 karakter.");
    return { userId: input.userId, password };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await (await import("@/lib/activity-log.server")).logActivity(context.userId, "password_reset", `Kata sandi pengguna ${data.userId} disetel ulang`);

    // Beri tahu pengguna lewat bot Telegram (diam bila belum tersambung).
    const { notifyUserTelegram } = await import("@/lib/telegram.server");
    const notified = await notifyUserTelegram(
      data.userId,
      `🔐 <b>Kata sandi disetel ulang oleh admin</b>\nKata sandi akun Anda baru saja disetel ulang.\nKata sandi baru: <code>${data.password}</code>\n\nSegera masuk dan ubah kata sandi Anda di menu Pengaturan Akun.`,
    );
    return { ok: true, notified };
  });

/** Hapus akun seorang anggota beserta perannya (super admin). */
export const deleteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId) throw new Error("Pengguna tidak valid.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context, true);
    if (data.userId === context.userId) {
      throw new Error("Anda tidak dapat menghapus akun Anda sendiri.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await (await import("@/lib/activity-log.server")).logActivity(context.userId, "user_delete", `Pengguna ${data.userId} dihapus`);
    return { ok: true };
  });

export interface MemberDetail {
  user_id: string;
  name: string;
  email: string;
  role: AppRole;
  session_id: string | null;
  session_status: string | null;
  wa_phone: string | null;
  wa_name: string | null;
  wa_picture: string | null;
  wa_error: string | null;
}

async function memberSession(userId: string): Promise<{ id: string; status: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("wa_sessions")
    .select("id,status,phone_number,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  const rows = (data ?? []) as { id: string; status: string }[];
  return rows.find((r) => r.status === "connected") ?? rows[0] ?? null;
}

/** Detail seorang pengguna beserta profil WhatsApp perangkat terhubungnya. */
export const getMemberDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId) throw new Error("Pengguna tidak valid.");
    return input;
  })
  .handler(async ({ data, context }): Promise<MemberDetail> => {
    await assertAdmin(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (error) throw new Error(error.message);

    const { data: profile } = await (supabaseAdmin as any)
      .from("profiles")
      .select("organization_name")
      .eq("user_id", data.userId)
      .maybeSingle();
    const { data: roleRows } = await (supabaseAdmin as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);

    const session = await memberSession(data.userId);
    let wa_name: string | null = null;
    let wa_picture: string | null = null;
    let wa_phone: string | null = null;
    let wa_error: string | null = null;
    if (session) {
      try {
        const { getWaProfile } = await import("@/lib/wa-gateway.server");
        const p = await getWaProfile(session.id);
        wa_name = p.name;
        wa_picture = p.picture;
        wa_phone = p.phone;
      } catch (err) {
        wa_error = (err as Error).message;
      }
    } else {
      wa_error = "Pengguna ini belum menautkan perangkat WhatsApp.";
    }

    return {
      user_id: data.userId,
      name:
        profile?.organization_name ??
        ((user.user?.user_metadata?.["organization_name"] ??
          user.user?.user_metadata?.["full_name"]) as string | undefined) ??
        "—",
      email: user.user?.email ?? "(tanpa email)",
      role: highest(((roleRows ?? []) as { role: AppRole }[]).map((r) => r.role)),
      session_id: session?.id ?? null,
      session_status: session?.status ?? null,
      wa_phone,
      wa_name,
      wa_picture,
      wa_error,
    };
  });

/** Ubah nama profil WhatsApp asli pada perangkat pengguna. */
export const setMemberWaName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; name: string }) => {
    const name = (input?.name ?? "").trim();
    if (!input?.userId) throw new Error("Pengguna tidak valid.");
    if (name.length < 1 || name.length > 25) throw new Error("Nama WhatsApp 1–25 karakter.");
    return { userId: input.userId, name };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context, true);
    const session = await memberSession(data.userId);
    if (!session || session.status !== "connected") {
      throw new Error("Perangkat WhatsApp pengguna ini tidak sedang terhubung.");
    }
    const { setWaProfileName } = await import("@/lib/wa-gateway.server");
    await setWaProfileName(session.id, data.name);
    return { ok: true };
  });

/** Ubah foto profil WhatsApp asli pada perangkat pengguna (base64 data URL). */
export const setMemberWaPicture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; dataUrl: string }) => {
    if (!input?.userId) throw new Error("Pengguna tidak valid.");
    const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
      (input.dataUrl ?? "").trim(),
    );
    if (!match) throw new Error("Berkas foto harus berupa gambar JPG, PNG, atau WEBP.");
    const data = match[2]!;
    if (data.length > 8_000_000) throw new Error("Ukuran foto terlalu besar (maksimal ±6 MB).");
    return { userId: input.userId, mimetype: match[1]!, data };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context, true);
    const session = await memberSession(data.userId);
    if (!session || session.status !== "connected") {
      throw new Error("Perangkat WhatsApp pengguna ini tidak sedang terhubung.");
    }
    const { setWaProfilePicture } = await import("@/lib/wa-gateway.server");
    await setWaProfilePicture(session.id, {
      mimetype: data.mimetype,
      filename: `profile.${data.mimetype.split("/")[1]}`,
      data: data.data,
    });
    return { ok: true };
  });

/**
 * Jaring pengaman: jika tabel peran masih kosong, akun yang pertama kali
 * berhasil masuk otomatis dijadikan super admin. Dipanggil setiap kali
 * seseorang selesai login; tidak melakukan apa pun bila sudah ada peran.
 */
export const ensureFirstUserIsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ promoted: boolean; role: AppRole }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const existing = await admin.from("user_roles").select("role").eq("user_id", context.userId);
    if (existing.error) return { promoted: false, role: "member" };
    const mine = ((existing.data ?? []) as { role: AppRole }[]).map((r) => r.role);
    if (mine.length > 0) return { promoted: false, role: highest(mine) };

    // Belum punya peran: cek apakah tabel peran benar-benar kosong.
    const any = await admin.from("user_roles").select("user_id").limit(1);
    if (any.error) return { promoted: false, role: "member" };
    if ((any.data ?? []).length > 0) return { promoted: false, role: "member" };

    const ins = await admin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "super_admin" });
    if (ins.error) return { promoted: false, role: "member" };
    return { promoted: true, role: "super_admin" };
  });
