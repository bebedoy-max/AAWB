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

export async function getBotUsername(): Promise<string> {
  if (cachedUsername) return cachedUsername;
  const cfg = await loadConfig();
  if (cfg.username) {
    cachedUsername = cfg.username.replace(/^@/, "");
    return cachedUsername;
  }
  const me = await callTelegram<{ username: string }>("getMe");
  cachedUsername = me.username;
  return me.username;
}

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  await callTelegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}
