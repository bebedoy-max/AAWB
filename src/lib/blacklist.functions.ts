/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminRole } from "@/lib/admin-guard.server";

const HINT = "Fitur Black List belum aktif. Jalankan db/migrations/034_black_list.sql di SQL Editor Supabase.";

function wrap(error: { message: string } | null) {
  if (!error) return;
  if (/sender_blacklist/.test(error.message)) throw new Error(HINT);
  throw new Error(error.message);
}

export interface BlacklistRow {
  id: string;
  phone: string;
  note: string | null;
  created_at: string;
}

export const listBlacklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminRole(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("sender_blacklist")
      .select("id,phone,note,created_at")
      .order("created_at", { ascending: false });
    wrap(error);
    return (data ?? []) as BlacklistRow[];
  });

export const addBlacklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string; note?: string }) => {
    let phone = String(input?.phone ?? "").replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "62" + phone.slice(1);
    if (phone.length < 8) throw new Error("Nomor tidak valid.");
    return { phone, note: String(input?.note ?? "").trim().slice(0, 200) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdminRole(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("sender_blacklist")
      .upsert({ phone: data.phone, note: data.note, created_by: context.userId }, { onConflict: "phone" });
    wrap(error);
    const { clearBlacklistCache } = await import("@/lib/blacklist.server");
    clearBlacklistCache();
    return { ok: true };
  });

export const deleteBlacklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Data tidak valid.");
    return { id: String(input.id) };
  })
  .handler(async ({ data, context }) => {
    await assertAdminRole(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("sender_blacklist").delete().eq("id", data.id);
    wrap(error);
    const { clearBlacklistCache } = await import("@/lib/blacklist.server");
    clearBlacklistCache();
    return { ok: true };
  });
