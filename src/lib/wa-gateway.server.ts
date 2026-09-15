/**
 * WhatsApp gateway client for the wa-gateway server (github.com/mimamch/wa-gateway).
 *
 * Contract (all JSON, auth via `key` header):
 *   GET  {BASE}/session                 -> { data: [{ session, status }] }
 *   GET  {BASE}/session/{id}            -> { success, data: { session, status, details, connection } }
 *   POST {BASE}/session/start           -> { qr } | { message: "Session already exist" }
 *   POST {BASE}/session/logout          -> { data: "success" }
 *   POST {BASE}/message/send-text       -> body { session, to, text }
 *   POST {BASE}/message/send-image      -> body { session, to, text, image_url }
 */

import type { WaSessionStatus } from "@/types/wa";

export interface GatewaySessionState {
  status: WaSessionStatus;
  qr: string | null;
  phone: string | null;
  battery: number | null;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

interface GatewayConfig {
  base: string;
  key: string | undefined;
}

let cache: { value: GatewayConfig | null; at: number } = { value: null, at: 0 };
const CACHE_MS = 15_000;

/** Baca konfigurasi dari tabel app_settings, dengan fallback ke variabel lingkungan. */
async function loadConfig(): Promise<GatewayConfig | null> {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;

  let base = process.env["WA_GATEWAY_URL"] ?? "";
  let key = process.env["WA_GATEWAY_API_KEY"] ?? undefined;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin as any)
      .from("app_settings")
      .select("wa_gateway_url,wa_gateway_api_key")
      .eq("id", "global")
      .maybeSingle();
    if (data?.wa_gateway_url) base = data.wa_gateway_url as string;
    if (data?.wa_gateway_api_key) key = data.wa_gateway_api_key as string;
  } catch {
    /* tabel belum ada / database tak terjangkau: pakai variabel lingkungan */
  }

  const value = base ? { base: base.replace(/\/+$/, ""), key } : null;
  cache = { value, at: Date.now() };
  return value;
}

/** Kosongkan cache setelah pengaturan disimpan dari UI admin. */
export function invalidateGatewayConfig(): void {
  cache = { value: null, at: 0 };
}

async function config(): Promise<GatewayConfig> {
  const cfg = await loadConfig();
  if (!cfg) {
    throw new GatewayError(
      "Gateway WhatsApp belum dikonfigurasi. Atur alamat gateway di menu Admin.",
      503,
    );
  }
  return cfg;
}


interface RawResult {
  status: number;
  body: Record<string, unknown> | string | null;
}

async function request(path: string, init?: RequestInit): Promise<RawResult> {
  const { base, key } = await config();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) {
    // wa-gateway authenticates with the `key` header; keep the others for compatibility.
    headers["key"] = key;
    headers["x-api-key"] = key;
  }

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      redirect: "manual",
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new GatewayError(`Tidak dapat terhubung ke gateway WhatsApp: ${(err as Error).message}`, 502);
  }

  if (res.status >= 300 && res.status < 400) {
    throw new GatewayError(
      "Gateway menolak permintaan (alamat tidak dikenal atau kunci API tidak valid).",
      502,
    );
  }

  const text = await res.text();
  let body: Record<string, unknown> | string | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function messageOf(body: RawResult["body"]): string {
  if (body && typeof body === "object") {
    for (const k of ["message", "error"]) {
      const v = (body as Record<string, unknown>)[k];
      if (typeof v === "string") return v;
    }
  }
  return typeof body === "string" ? body.slice(0, 200) : "";
}

async function call(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await request(path, init);
  if (res.status < 200 || res.status >= 300) {
    throw new GatewayError(
      `Kesalahan gateway: ${messageOf(res.body) || `HTTP ${res.status}`}`,
      res.status === 404 ? 404 : 502,
    );
  }
  return (res.body && typeof res.body === "object" ? res.body : {}) as Record<string, unknown>;
}

function normalizeStatus(value: unknown, connected: boolean, hasQr: boolean): WaSessionStatus {
  if (connected) return "connected";
  const s = String(value ?? "").toLowerCase();
  if (["connected", "open", "authenticated", "ready", "online"].includes(s)) return "connected";
  if (["connecting", "qr", "pairing", "scan_qr", "starting"].includes(s)) return "connecting";
  if (hasQr) return "connecting";
  return "disconnected";
}

function digits(value: unknown): string | null {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 15) || null : null;
}

/** GET /session/{id} — returns null when the gateway has no such session. */
async function findSession(id: string): Promise<GatewaySessionState | null> {
  const res = await request(`/session/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (res.status < 200 || res.status >= 300) {
    throw new GatewayError(`Kesalahan gateway: ${messageOf(res.body) || `HTTP ${res.status}`}`, 502);
  }
  const data = ((res.body as Record<string, unknown>)?.["data"] ?? {}) as Record<string, unknown>;
  const details = (data["details"] ?? {}) as Record<string, unknown>;
  const connection = (data["connection"] ?? {}) as Record<string, unknown>;
  return {
    status: normalizeStatus(data["status"], connection["isConnected"] === true, false),
    qr: null,
    phone: digits(details["phoneNumber"]),
    battery: null,
  };
}

export const gatewayConfigured = async (): Promise<boolean> => Boolean(await loadConfig());

/** Cek cepat apakah gateway dapat dihubungi dengan konfigurasi saat ini. */
export async function pingGateway(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await request("/session");
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, message: "Gateway terhubung." };
    }
    return { ok: false, message: `Gateway menjawab HTTP ${res.status}.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function dropSession(id: string): Promise<void> {
  try {
    await call("/session/logout", { method: "POST", body: JSON.stringify({ session: id }) });
  } catch {
    /* ignore — the session may already be gone */
  }
}

/**
 * Ask the gateway for a fresh QR. The gateway only emits the QR string in the
 * response of `POST /session/start`, so a stale pending session is dropped first.
 * Teardown is asynchronous on the gateway, so "Session already exist" is retried.
 */
export async function startSession(id: string): Promise<GatewaySessionState> {
  const existing = await findSession(id);
  if (existing?.status === "connected") return existing;
  if (existing) await dropSession(id);

  let body: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await request("/session/start", {
      method: "POST",
      body: JSON.stringify({ session: id }),
    });
    if (res.status >= 200 && res.status < 300) {
      body = (res.body && typeof res.body === "object" ? res.body : {}) as Record<string, unknown>;
      break;
    }
    const msg = messageOf(res.body);
    if (!/already exist/i.test(msg)) {
      throw new GatewayError(`Kesalahan gateway: ${msg || `HTTP ${res.status}`}`, 502);
    }
    // The old session is still lingering: drop it again and retry shortly.
    await dropSession(id);
    await sleep(700);
  }

  if (!body) {
    const after = await findSession(id);
    if (after) return after;
    throw new GatewayError(
      "Gateway tidak dapat memulai sesi pemasangan baru. Silakan coba lagi sebentar lagi.",
      502,
    );
  }

  const qrValue = body["qr"];
  const qr = typeof qrValue === "string" && qrValue.length > 0 ? qrValue : null;
  if (!qr) {
    const after = await findSession(id);
    if (after) return after;
  }
  return {
    status: normalizeStatus(body["status"], false, Boolean(qr)),
    qr,
    phone: null,
    battery: null,
  };
}

/** Poll status. The gateway never re-emits the QR, so `qr` stays null here. */
export async function sessionStatus(id: string): Promise<GatewaySessionState> {
  const state = await findSession(id);
  return state ?? { status: "disconnected", qr: null, phone: null, battery: null };
}

export async function logoutSession(id: string): Promise<void> {
  const res = await request("/session/logout", {
    method: "POST",
    body: JSON.stringify({ session: id }),
  });
  if (res.status === 400 || res.status === 404) return; // already gone
  if (res.status < 200 || res.status >= 300) {
    throw new GatewayError(`Kesalahan gateway: ${messageOf(res.body) || `HTTP ${res.status}`}`, 502);
  }
}

export async function sendMessage(params: {
  sessionId: string;
  to: string;
  text: string;
  mediaUrl?: string | null;
}): Promise<{ id: string | null }> {
  const isImage = Boolean(params.mediaUrl);
  const path = isImage ? "/message/send-image" : "/message/send-text";
  const raw = await call(path, {
    method: "POST",
    body: JSON.stringify({
      session: params.sessionId,
      to: params.to,
      text: params.text,
      ...(params.mediaUrl ? { image_url: params.mediaUrl } : {}),
    }),
  });
  const data = (raw["data"] ?? raw) as Record<string, unknown>;
  const key = data["key"] as Record<string, unknown> | undefined;
  const id = (typeof data["id"] === "string" && data["id"]) || (key && typeof key["id"] === "string" ? key["id"] : null);
  return { id: typeof id === "string" ? id : null };
}
