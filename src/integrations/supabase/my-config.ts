// Connection details for this project's OWN Supabase instance.
//
// The browser never talks to Supabase directly: it goes through the
// same-origin proxy at /api/public/db, which injects the real URL and
// publishable key server-side (see src/routes/api/public/db/$.ts).
// So the browser only needs a non-empty placeholder key.

const serverEnv = (name: string): string =>
  (typeof process !== "undefined" ? (process.env?.[name] ?? "") : "") as string;

const isServer = typeof window === "undefined";

export const MY_SUPABASE_URL = isServer ? serverEnv("MY_SUPABASE_URL") : "";

export const MY_SUPABASE_PUBLISHABLE_KEY = isServer
  ? serverEnv("MY_SUPABASE_PUBLISHABLE_KEY")
  : "proxied-by-server";
