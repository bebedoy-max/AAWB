/**
 * Server functions untuk peran pengguna dan pengaturan gateway WhatsApp.
 * Semua pemeriksaan hak akses dilakukan di server.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppRole = "super_admin" | "admin" | "member";

export interface MemberRow {
  user_id: string;
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

/* eslint-disable @typescript-eslint/no-explicit-any */

async function rolesOf(supabase: any, userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
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
        role,
        is_admin: role !== "member",
        is_super_admin: role === "super_admin",
        setup_required: false,
      };
    } catch {
      return {
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
    await assertAdmin(context);
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
    await assertAdmin(context);
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
    await assertAdmin(context);
    const { pingGateway } = await import("@/lib/wa-gateway.server");
    return pingGateway();
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
    const roleMap = new Map<string, AppRole[]>();
    for (const r of (roleRows ?? []) as { user_id: string; role: AppRole }[]) {
      roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    }

    return users.users
      .map((u) => ({
        user_id: u.id,
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
    if (data.userId === context.userId && data.role !== "super_admin") {
      throw new Error("Anda tidak dapat menurunkan peran akun Anda sendiri.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const del = await (supabaseAdmin as any).from("user_roles").delete().eq("user_id", data.userId);
    if (del.error) throw new Error(del.error.message);
    const ins = await (supabaseAdmin as any)
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (ins.error) throw new Error(ins.error.message);
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
