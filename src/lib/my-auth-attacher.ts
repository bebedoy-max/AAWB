import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/my-client";

/**
 * Attaches the signed-in user's bearer token (from our own Supabase instance)
 * to every server function call.
 */
export const attachMySupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
