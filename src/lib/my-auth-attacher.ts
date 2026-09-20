import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/my-client";

/**
 * Attaches the signed-in user's bearer token (from our own Supabase instance)
 * to every server function call. Refreshes the token first when it is expired
 * or about to expire, so the server never receives a stale token.
 *
 * Mobile browsers freeze background tabs, which pauses the automatic refresh
 * timer. When the user comes back the stored token is often already expired,
 * so we refresh eagerly (and retry once) instead of sending a dead token that
 * the server rejects with "Unauthorized: Invalid token".
 */

// Refresh well before expiry: a slow mobile connection can burn several
// seconds between attaching the token and the server validating it.
const REFRESH_MARGIN_MS = 120_000;

function isFresh(expiresAt: number | undefined): boolean {
  return !!expiresAt && expiresAt * 1000 - Date.now() > REFRESH_MARGIN_MS;
}

export const attachMySupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let session = (await supabase.auth.getSession()).data.session;

    if (session && !isFresh(session.expires_at ?? undefined)) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (refreshed.session && isFresh(refreshed.session.expires_at ?? undefined)) {
          session = refreshed.session;
          break;
        }
        if (!error) {
          // Another tab or the auto-refresh timer may have rotated the token
          // already; read the freshly stored session before retrying.
          const current = (await supabase.auth.getSession()).data.session;
          if (current && isFresh(current.expires_at ?? undefined)) {
            session = current;
            break;
          }
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
      }
    }

    const token = session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
