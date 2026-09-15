/**
 * Points every server-side Supabase client at the project's OWN Supabase
 * instance by mapping the MY_SUPABASE_* secrets onto the SUPABASE_* names the
 * generated clients read. Called from the request middleware, so it runs before
 * any handler touches the database.
 */
export function applyMySupabaseEnv(): void {
  const url = process.env["MY_SUPABASE_URL"];
  const publishable = process.env["MY_SUPABASE_PUBLISHABLE_KEY"];
  const serviceRole = process.env["MY_SUPABASE_SERVICE_ROLE_KEY"];

  if (url) process.env["SUPABASE_URL"] = url;
  if (publishable) {
    process.env["SUPABASE_PUBLISHABLE_KEY"] = publishable;
    process.env["SUPABASE_ANON_KEY"] = publishable;
  }
  if (serviceRole) process.env["SUPABASE_SERVICE_ROLE_KEY"] = serviceRole;
}
