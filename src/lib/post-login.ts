import { getMyRole } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/my-client";

export type PostLoginPath = "/admin" | "/dashboard";

/** Tunggu sampai sesi tersedia agar token ikut terkirim ke server function. */
async function waitForSession(timeoutMs = 4000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/** Arahkan admin ke konsol admin dan member ke ruang kerja member. */
export async function getPostLoginPath(): Promise<PostLoginPath> {
  try {
    if (!(await waitForSession())) return "/dashboard";
    const role = await getMyRole();
    return role.is_admin ? "/admin" : "/dashboard";
  } catch {
    return "/dashboard";
  }
}
