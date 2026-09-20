/** Helper Bot API Telegram — hanya untuk kode server. */
import { createHash } from "node:crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */

const API = "https://api.telegram.org";

interface TelegramConfig {
  token: string | null;
  username: string | null;
}

let cachedConfig: TelegramConfig | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

/** Baca token dari env, atau dari tabel app_settings bila env kosong. */
async function loadConfig(force = false): Promise<TelegramConfig> {
  const envToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (envToken) return { token: envToken, username: null };

  if (!force && cachedConfig && Date.now() - cachedAt < CACHE_MS) return cachedConfig;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("app_settings")
    .select("telegram_bot_token,telegram_bot_username")
    .eq("id", "global")
    .maybeSingle();

  cachedConfig = {
    token: data?.telegram_bot_token ?? null,
    username: data?.telegram_bot_username ?? null,
  };
  cachedAt = Date.now();
  cachedUsername = null;
  return cachedConfig;
}

export function invalidateTelegramConfig(): void {
  cachedConfig = null;
  cachedAt = 0;
  cachedUsername = null;
}

export async function botToken(): Promise<string> {
  const cfg = await loadConfig();
  if (!cfg.token) throw new Error("Token bot Telegram belum diatur. Isi di halaman Admin > Sistem.");
  return cfg.token;
}

export async function isTelegramConfigured(): Promise<boolean> {
  const cfg = await loadConfig();
  return Boolean(cfg.token);
}

export async function webhookSecret(): Promise<string> {
  return createHash("sha256").update(`telegram-webhook:${await botToken()}`).digest("base64url");
}

export async function callTelegram<T = any>(
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API}/bot${await botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!res.ok || !json.ok) {
    throw new Error(`Telegram ${method} gagal [${res.status}]: ${json.description ?? "tidak diketahui"}`);
  }
  return json.result as T;
}

let cachedUsername: string | null = null;

/**
 * Bersihkan isian username bot: admin sering menempel tautan lengkap
 * (https://t.me/namabot), tanda @, atau spasi. Hasil akhir harus username murni.
 */
export function normalizeBotUsername(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim();
  v = v.replace(/^https?:\/\//i, "").replace(/^(t\.me|telegram\.me|telegram\.dog)\//i, "");
  v = v.replace(/^@/, "").split(/[/?#\s]/)[0] ?? "";
  return /^[A-Za-z0-9_]{4,32}$/.test(v) ? v : null;
}

export async function getBotUsername(): Promise<string> {
  if (cachedUsername) return cachedUsername;
  const cfg = await loadConfig();
  const clean = normalizeBotUsername(cfg.username);
  if (clean) {
    cachedUsername = clean;
    return cachedUsername;
  }
  const me = await callTelegram<{ username: string }>("getMe");
  cachedUsername = me.username;
  return me.username;
}

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  await callTelegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

/** Daftarkan ulang webhook bot ke URL aplikasi (dipakai saat token bot diganti). */
export async function registerWebhook(baseUrl: string): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/public/telegram/webhook`;
  await callTelegram("setWebhook", {
    url,
    secret_token: await webhookSecret(),
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: true,
  });
  return url;
}

/** Kirim notifikasi ke akun Telegram milik seorang pengguna (diam bila belum tersambung). */
export async function notifyUserTelegram(userId: string, text: string): Promise<boolean> {
  try {
    if (!(await isTelegramConfigured())) {
      console.warn("[telegram] notifikasi dilewati: bot belum dikonfigurasi");
      return false;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("telegram_links")
      .select("chat_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data?.chat_id) {
      console.warn(`[telegram] notifikasi dilewati: user ${userId} belum menyambungkan Telegram`);
      return false;
    }
    await sendTelegramMessage(data.chat_id, text);
    return true;
  } catch (err) {
    console.error(`[telegram] gagal kirim notifikasi ke user ${userId}:`, (err as Error).message);
    return false;
  }
}
