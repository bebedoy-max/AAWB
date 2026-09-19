/**
 * Menghubungkan akun Telegram milik masing-masing pengguna secara nyata.
 *
 * Alur: pengguna menekan "Hubungkan Telegram" -> aplikasi membuat kode sekali
 * pakai -> pengguna membuka tautan t.me dan menekan START -> Telegram mengirim
 * update ke webhook aplikasi -> chat_id dan username asli tersimpan.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TelegramStatus {
  configured: boolean;
  connected: boolean;
  username: string | null;
  first_name: string | null;
  chat_id: string | null;
  connected_at: string | null;
  bot_username: string | null;
}

export const getTelegramStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TelegramStatus> => {
    const { getBotUsername, isTelegramConfigured } = await import("@/lib/telegram.server");
    const configured = await isTelegramConfigured();
    const empty: TelegramStatus = {
      configured,
      connected: false,
      username: null,
      first_name: null,
      chat_id: null,
      connected_at: null,
      bot_username: configured ? await getBotUsername().catch(() => null) : null,
    };
    if (!configured) return empty;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("telegram_links")
      .select("chat_id,username,first_name,connected_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!data?.chat_id) return empty;
    return {
      ...empty,
      connected: true,
      username: data.username ?? null,
      first_name: data.first_name ?? null,
      chat_id: String(data.chat_id),
      connected_at: data.connected_at ?? null,
    };
  });

/** Membuat kode sekali pakai dan mengembalikan tautan t.me untuk dibuka pengguna. */
export const startTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string; code: string; bot_username: string }> => {
    const { getBotUsername, isTelegramConfigured } = await import("@/lib/telegram.server");
    if (!(await isTelegramConfigured())) {
      throw new Error("Bot Telegram aplikasi belum dikonfigurasi. Hubungi admin.");
    }
    const botUsername = await getBotUsername();
    const code = `lk${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("telegram_links").upsert(
      {
        user_id: context.userId,
        link_code: code,
        code_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    return { url: `https://t.me/${botUsername}?start=${code}`, code, bot_username: botUsername };
  });

export const disconnectTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("telegram_links")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Kirim notifikasi ke Telegram pengguna setelah ia mengubah kata sandi sendiri.
 * Diam saja bila bot belum aktif atau akun belum tersambung.
 */
export const notifyOwnPasswordChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { notifyUserTelegram } = await import("@/lib/telegram.server");
    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    const sent = await notifyUserTelegram(
      context.userId,
      `🔐 <b>Kata sandi diubah</b>\nKata sandi akun Anda baru saja diubah pada ${waktu} WIB.\n\nJika bukan Anda yang melakukannya, segera hubungi admin.`,
    );
    return { sent };
  });
