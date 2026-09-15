import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Builds a Supabase client scoped to the caller's bearer token so RLS applies
 * as that user. Returns null when the request carries no credentials.
 */
export function userClientFromRequest(request: Request): SupabaseClient | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader, apikey: key } },
  });
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
