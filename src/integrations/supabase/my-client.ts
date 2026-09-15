// Browser/SSR Supabase client for the project's OWN Supabase instance.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { MY_SUPABASE_URL, MY_SUPABASE_PUBLISHABLE_KEY } from "./my-config";

const SUPABASE_URL = MY_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = MY_SUPABASE_PUBLISHABLE_KEY;

function isOpaqueApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function supabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    }
    // Opaque (non-JWT) keys must not be sent as a bearer token.
    if (isOpaqueApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function createMySupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Konfigurasi database belum lengkap: MY_SUPABASE_URL dan MY_SUPABASE_PUBLISHABLE_KEY harus tersimpan.",
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: supabaseFetch(SUPABASE_PUBLISHABLE_KEY) },
    auth: {
      storage: typeof window === "undefined" ? undefined : window.localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _client: ReturnType<typeof createMySupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createMySupabaseClient>, {
  get(_, prop, receiver) {
    if (!_client) _client = createMySupabaseClient();
    return Reflect.get(_client, prop, receiver);
  },
});
