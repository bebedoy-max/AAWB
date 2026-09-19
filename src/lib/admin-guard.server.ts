/**
 * Pemeriksaan peran sisi server. userId selalu berasal dari token terverifikasi,
 * dibaca dengan akses penuh agar RLS tidak menyembunyikan peran pengguna sendiri.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type AppRoleName = "super_admin" | "admin" | "member";

export async function rolesOfUser(userId: string): Promise<AppRoleName[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { role: AppRoleName }[]).map((r) => r.role);
}

export async function assertAdminRole(userId: string, superOnly = false): Promise<AppRoleName> {
  const roles = await rolesOfUser(userId);
  const role: AppRoleName = roles.includes("super_admin")
    ? "super_admin"
    : roles.includes("admin")
      ? "admin"
      : "member";
  if (superOnly ? role !== "super_admin" : role === "member") {
    throw new Error(
      superOnly
        ? "Hanya super admin yang dapat melakukan tindakan ini."
        : "Hanya admin yang dapat melakukan tindakan ini.",
    );
  }
  return role;
}
