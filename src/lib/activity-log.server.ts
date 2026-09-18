/**
 * Pencatatan aktivitas pengguna dan admin.
 * Aktivitas super admin sengaja TIDAK dicatat.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

async function resolveActor(admin: any, userId: string) {
  const [{ data: roleRows }, userRes] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", userId),
    admin.auth.admin.getUserById(userId).catch(() => ({ data: null })),
  ]);
  const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
  const role = roles.includes("super_admin")
    ? "super_admin"
    : roles.includes("admin")
      ? "admin"
      : "member";
  const email = (userRes as any)?.data?.user?.email ?? null;
  return { role, email };
}

/**
 * Simpan satu baris aktivitas. Aman dipanggil tanpa await-error handling:
 * kegagalan pencatatan tidak boleh menggagalkan aksi utama.
 */
export async function logActivity(
  userId: string | null | undefined,
  action: string,
  detail?: string | null,
): Promise<void> {
  try {
    if (!userId) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { role, email } = await resolveActor(admin, userId);
    if (role === "super_admin") return; // aktivitas super admin tidak dicatat
    await admin.from("activity_log").insert({
      user_id: userId,
      actor_role: role,
      actor_email: email,
      action,
      detail: detail ? detail.slice(0, 500) : null,
    } as never);
  } catch {
    // diabaikan dengan sengaja
  }
}
