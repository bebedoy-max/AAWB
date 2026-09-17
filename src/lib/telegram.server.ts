/** Helper Bot API Telegram — hanya untuk kode server. */
import { createHash } from "node:crypto";

const API = "https://api.telegram.org";

export function botToken(): string {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diatur.");
  return token;
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env["TELEGRAM_BOT_TOKEN"]);
}

export function webhookSecret(): string {
  return createHash("sha256").update(`telegram-webhook:${botToken()}`).digest("base64url");
}

export async function callTelegram<T = any>(
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API}/bot${botToken()}/${method}`, {
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
  const me = await callTelegram<{ username: string }>("getMe");
  cachedUsername = me.username;
  return me.username;
}

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  await callTelegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}
