import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/my-client";

/**
 * Attaches the signed-in user's bearer token (from our own Supabase instance)
 * to every server function call. Refreshes the token first when it is expired
 * or about to expire, so the server never receives a stale token.
 */
export const attachMySupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    let session = data.session;

    const expiresAt = session?.expires_at ?? 0;
    const isStale = !!session && expiresAt * 1000 - Date.now() < 60_000;

    if (isStale) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session ?? null;
    }

    const token = session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
