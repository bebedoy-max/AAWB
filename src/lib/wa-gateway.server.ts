/**
 * WhatsApp gateway client for WAHA (github.com/devlikeapro/waha).
 *
 * Contract (all JSON, auth via `X-Api-Key` header):
 *   GET    {BASE}/api/sessions/{name}        -> { name, status, me: { id, pushName }, ... }
 *   POST   {BASE}/api/sessions/              -> body { name }                (create, status STOPPED)
 *   POST   {BASE}/api/sessions/{name}/start  -> no body                     (STOPPED -> STARTING -> SCAN_QR_CODE/WORKING)
 *   POST   {BASE}/api/sessions/{name}/logout -> no body
 *   GET    {BASE}/api/{name}/auth/qr?format=raw -> { value: "<raw pairing string>" } (only while SCAN_QR_CODE)
 *   POST   {BASE}/api/sendText               -> body { session, chatId, text }
 *   POST   {BASE}/api/sendImage              -> body { session, chatId, file: { url }, caption }
 *
 * Session status values returned by WAHA: STOPPED | STARTING | SCAN_QR_CODE | WORKING | FAILED
 */

import type { MediaType, TemplateButton, WaSessionStatus } from "@/types/wa";
import {
  extractInlineButtons,
  inlineButtonsAsText,
  stripButtonTokens,
} from "@/lib/whatsapp";
import { isConnectPhaseNetworkError } from "@/lib/blast-retry";


export interface GatewaySessionState {
  status: WaSessionStatus;
  authStep: "pairing" | "passkey" | "confirmation" | null;
  qr: string | null;
  phone: string | null;
  battery: number | null;
}

interface InternalGatewaySessionState extends GatewaySessionState {
  rawStatus: string;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly deliveryUnknown = false,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

const sessionSendLocks = new Map<string, Promise<void>>();
const sessionRestartLocks = new Map<string, Promise<GatewaySessionState>>();
// Penyambungan ulang sesi WhatsApp jangan terlalu sering: tiap kali memutus dan menyambung ulang
// sesi, WhatsApp bisa mencurigai perangkat. Maksimal sekali per 3 menit per perangkat.
const SESSION_RESTART_MIN_INTERVAL_MS = 3 * 60_000;
const lastSessionRestartAt = new Map<string, number>();
function shouldRestartSession(id: string): boolean {
  const now = Date.now();
  if (now - (lastSessionRestartAt.get(id) ?? 0) < SESSION_RESTART_MIN_INTERVAL_MS) return false;
  lastSessionRestartAt.set(id, now);
  return true;
}

/**
 * WAHA uses several non-standard responses when its internal WhatsApp socket
 * has gone stale although the session endpoint still reports WORKING.
 */
function isStaleSessionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof GatewayError ? error.status : 0;
  return (
    status === 463 ||
    /session status is not as expected|not in working state|connection closed|stream errored|restart required/i.test(
      message,
    )
  );
}

function isUnknownDeliveryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    (error instanceof GatewayError && (error.deliveryUnknown || error.status === 463)) ||
    /websocket disconnected before message send returned response/i.test(message)
  );
}

/** Do not expose WAHA/gRPC internals such as `2 UNKNOWN` or status 463 to users. */
function friendlyGatewayMessage(status: number, body: RawResult["body"]): string {
  const raw = messageOf(body);
  if (
    status === 463 ||
    /websocket disconnected|session status is not as expected|restart the session|\bunknown\b/i.test(raw)
  ) {
    return "Koneksi perangkat WhatsApp terputus. Perangkat sedang dipulihkan otomatis.";
  }
  return raw || `HTTP ${status}`;
}

function isUnsupportedMessageFeature(error: unknown): boolean {
  if (!(error instanceof GatewayError)) return false;
  return [400, 404, 405, 422, 501].includes(error.status) && !isStaleSessionError(error);
}

async function withSessionSendLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
  const previous = sessionSendLocks.get(sessionId) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  sessionSendLocks.set(sessionId, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (sessionSendLocks.get(sessionId) === tail) sessionSendLocks.delete(sessionId);
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
    // WAHA authenticates every /api/* request with the X-Api-Key header.
    headers["X-Api-Key"] = key;
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
    const isSendRequest = init?.method === "POST" && /^\/api\/send/i.test(path);
    // Gagal SEBELUM tersambung ke gateway (gateway mati, DNS, koneksi ditolak): pesan pasti
    // belum terkirim, jadi bukan hasil "tidak diketahui" dan aman dikembalikan ke antrean.
    const beforeSend = isConnectPhaseNetworkError(err);
    throw new GatewayError(
      `Tidak dapat terhubung ke gateway WhatsApp: ${(err as Error).message}`,
      502,
      isSendRequest && !beforeSend,
    );
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
    // WAHA membungkus error internal di dalam "exception".
    const exception = (body as Record<string, unknown>)["exception"];
    if (exception && typeof exception === "object") {
      const v = (exception as Record<string, unknown>)["message"];
      if (typeof v === "string") return v;
    }
  }
  return typeof body === "string" ? body.slice(0, 200) : "";
}

async function call(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await request(path, init);
  if (res.status < 200 || res.status >= 300) {
    const isSendRequest = init?.method === "POST" && /^\/api\/send/i.test(path);
    throw new GatewayError(
      friendlyGatewayMessage(res.status, res.body),
      res.status >= 400 && res.status < 600 ? res.status : 502,
      isSendRequest && isUnknownDeliveryError(new GatewayError(messageOf(res.body), res.status)),
    );
  }
  return (res.body && typeof res.body === "object" ? res.body : {}) as Record<string, unknown>;
}

/** Peta status mentah WAHA (STOPPED/STARTING/SCAN_QR_CODE/WORKING/FAILED) ke status internal NAROWA. */
function normalizeStatus(rawStatus: unknown): WaSessionStatus {
  const s = String(rawStatus ?? "").toUpperCase();
  if (s === "WORKING") return "connected";
  if (
    s === "STARTING" ||
    s === "SCAN_QR_CODE" ||
    s === "PASSKEY_REQUIRED" ||
    s === "PASSKEY_CONFIRMATION_REQUIRED"
  ) {
    return "connecting";
  }
  return "disconnected"; // STOPPED, FAILED, atau tidak dikenal
}

function digits(value: unknown): string | null {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 15) || null : null;
}

/** GET /api/sessions/{id} — returns null when the gateway has no such session. */
async function findSession(id: string): Promise<InternalGatewaySessionState | null> {
  const res = await request(`/api/sessions/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (res.status < 200 || res.status >= 300) {
    throw new GatewayError(`Kesalahan gateway: ${messageOf(res.body) || `HTTP ${res.status}`}`, 502);
  }
  const body = (res.body ?? {}) as Record<string, unknown>;
  const me = (body["me"] ?? {}) as Record<string, unknown>;
  const rawStatus = String(body["status"] ?? "").toUpperCase();
  return {
    status: normalizeStatus(rawStatus),
    authStep:
      rawStatus === "PASSKEY_REQUIRED"
        ? "passkey"
        : rawStatus === "PASSKEY_CONFIRMATION_REQUIRED"
          ? "confirmation"
          : rawStatus === "SCAN_QR_CODE"
            ? "pairing"
            : null,
    qr: null, // WAHA never returns the QR inline; fetch it separately (see fetchQr()).
    phone: digits(me["id"]),
    battery: null, // Not exposed by WAHA's session payload.
    rawStatus,
  };
}

/** GET /api/{id}/auth/qr?format=raw — only valid while status is SCAN_QR_CODE. */
async function fetchQr(id: string): Promise<string | null> {
  const res = await request(`/api/${encodeURIComponent(id)}/auth/qr?format=raw`);
  if (res.status < 200 || res.status >= 300) return null;
  const body = res.body as Record<string, unknown> | null;
  const value = body?.["value"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export const gatewayConfigured = async (): Promise<boolean> => Boolean(await loadConfig());

/** Cek cepat apakah gateway dapat dihubungi dengan konfigurasi saat ini. */
export async function pingGateway(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await request("/api/sessions/?all=true");
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, message: "Gateway terhubung." };
    }
    return { ok: false, message: `Gateway menjawab HTTP ${res.status}.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pairingCooldowns = new Map<string, number>();
const PAIRING_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Ask WAHA for a fresh QR. WAHA only serves the QR while the session's status
 * is SCAN_QR_CODE, so after creating/starting the session we poll briefly for
 * that status before fetching it.
 */
export async function startSession(id: string): Promise<GatewaySessionState> {
  let existing = await findSession(id);

  if (existing?.status === "connected") return existing;

  // A FAILED unpaired session can stay poisoned even after stop/start (notably
  // on GOWS). Recreate it so WAHA can return to SCAN_QR_CODE and issue a code.
  if (existing?.rawStatus === "FAILED") {
    const stopped = await request(`/api/sessions/${encodeURIComponent(id)}/stop`, {
      method: "POST",
    });
    if (stopped.status < 200 || (stopped.status >= 300 && stopped.status !== 404)) {
      throw new GatewayError(
        `Sesi WhatsApp gagal dipulihkan: ${messageOf(stopped.body) || `HTTP ${stopped.status}`}`,
        stopped.status >= 400 && stopped.status < 600 ? stopped.status : 502,
      );
    }

    const removed = await request(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (removed.status < 200 || (removed.status >= 300 && removed.status !== 404)) {
      throw new GatewayError(
        `Sesi WhatsApp gagal dibuat ulang: ${messageOf(removed.body) || `HTTP ${removed.status}`}`,
        removed.status >= 400 && removed.status < 600 ? removed.status : 502,
      );
    }
    existing = null;
  }

  if (!existing) {
    // Session doesn't exist yet on the gateway: create it (starts STOPPED).
    const created = await request("/api/sessions/", {
      method: "POST",
      body: JSON.stringify({ name: id }),
    });
    if (created.status < 200 || (created.status >= 300 && created.status !== 422)) {
      throw new GatewayError(
        `Kesalahan gateway: ${messageOf(created.body) || `HTTP ${created.status}`}`,
        502,
      );
    }
  }

  if (existing?.rawStatus !== "STARTING" && existing?.rawStatus !== "SCAN_QR_CODE") {
    const started = await request(`/api/sessions/${encodeURIComponent(id)}/start`, {
      method: "POST",
    });
    if (started.status < 200 || started.status >= 300) {
      const msg = messageOf(started.body);
      // "already exists"/"already started"-type responses are fine to ignore.
      if (!/already|working|starting/i.test(msg)) {
        throw new GatewayError(
          `Kesalahan gateway: ${msg || `HTTP ${started.status}`}`,
          started.status >= 400 && started.status < 600 ? started.status : 502,
        );
      }
    }
  }

  // STARTING belum siap menerima request-code. Tunggu status mentah WAHA
  // benar-benar SCAN_QR_CODE (atau WORKING jika sesi lama tersambung kembali).
  let state: InternalGatewaySessionState | null = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    state = await findSession(id);
    if (
      state &&
      ["WORKING", "SCAN_QR_CODE", "PASSKEY_REQUIRED", "PASSKEY_CONFIRMATION_REQUIRED"].includes(
        state.rawStatus,
      )
    ) {
      break;
    }
    if (state?.rawStatus === "FAILED") {
      throw new GatewayError(
        "Sesi WhatsApp gagal dimulai oleh gateway setelah dibuat ulang. Periksa kondisi gateway lalu coba lagi.",
        502,
      );
    }
    await sleep(700);
  }

  if (!state || !["WORKING", "SCAN_QR_CODE", "PASSKEY_REQUIRED", "PASSKEY_CONFIRMATION_REQUIRED"].includes(state.rawStatus)) {
    throw new GatewayError(
      `Gateway belum siap untuk pemasangan (status: ${state?.rawStatus || "tidak diketahui"}). Silakan coba lagi.`,
      504,
    );
  }

  if (state.status === "connected") return state;

  const qr = await fetchQr(id);
  return { ...state, qr };
}

/** Poll status. Does not fetch the QR (only startSession does, since it's short-lived). */
export async function sessionStatus(id: string): Promise<GatewaySessionState> {
  const state = await findSession(id);
  return state ?? { status: "disconnected", authStep: null, qr: null, phone: null, battery: null };
}

/**
 * Recover an existing sending session without deleting its saved WhatsApp
 * identity. This is intentionally separate from the pairing flow: deleting a
 * FAILED session here would force the user to scan/pair the device again.
 */
export async function reconnectSession(id: string): Promise<GatewaySessionState> {
  let state = await findSession(id);
  if (!state || state.status === "connected") {
    return state ?? { status: "disconnected", authStep: null, qr: null, phone: null, battery: null };
  }

  if (state.rawStatus === "FAILED") {
    const stopped = await request(`/api/sessions/${encodeURIComponent(id)}/stop`, { method: "POST" });
    if (stopped.status < 200 || (stopped.status >= 300 && stopped.status !== 404)) {
      throw new GatewayError(
        `Perangkat gagal dipulihkan: ${messageOf(stopped.body) || `HTTP ${stopped.status}`}`,
        stopped.status >= 400 && stopped.status < 600 ? stopped.status : 502,
      );
    }
  }

  const started = await request(`/api/sessions/${encodeURIComponent(id)}/start`, { method: "POST" });
  if (started.status < 200 || started.status >= 300) {
    const message = messageOf(started.body);
    if (!/already|working|starting/i.test(message)) {
      throw new GatewayError(
        `Perangkat gagal disambungkan kembali: ${message || `HTTP ${started.status}`}`,
        started.status >= 400 && started.status < 600 ? started.status : 502,
      );
    }
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await sleep(1_000);
    state = await findSession(id);
    if (!state || state.status === "connected" || state.rawStatus === "FAILED") break;
  }

  return state ?? { status: "disconnected", authStep: null, qr: null, phone: null, battery: null };
}

/** Force WAHA to replace a stale transport while preserving the paired identity. */
async function restartSessionTransport(id: string): Promise<GatewaySessionState> {
  const stopped = await request(`/api/sessions/${encodeURIComponent(id)}/stop`, { method: "POST" });
  if (stopped.status < 200 || (stopped.status >= 300 && stopped.status !== 404)) {
    throw new GatewayError(
      `Perangkat gagal dimulai ulang: ${messageOf(stopped.body) || `HTTP ${stopped.status}`}`,
      stopped.status >= 400 && stopped.status < 600 ? stopped.status : 502,
    );
  }

  await sleep(1_000);
  const started = await request(`/api/sessions/${encodeURIComponent(id)}/start`, { method: "POST" });
  if (started.status < 200 || started.status >= 300) {
    const message = messageOf(started.body);
    if (!/already|working|starting/i.test(message)) {
      throw new GatewayError(
        `Perangkat gagal dimulai ulang: ${message || `HTTP ${started.status}`}`,
        started.status >= 400 && started.status < 600 ? started.status : 502,
      );
    }
  }

  let state: GatewaySessionState = {
    status: "disconnected",
    authStep: null,
    qr: null,
    phone: null,
    battery: null,
  };
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await sleep(1_000);
    state = await sessionStatus(id);
    if (state.status === "connected") break;
  }
  return state;
}

/** Collapse simultaneous recovery attempts for the same WhatsApp device. */
async function recoverSessionTransport(id: string): Promise<GatewaySessionState> {
  const existing = sessionRestartLocks.get(id);
  if (existing) return existing;

  const recovery = restartSessionTransport(id).finally(() => {
    if (sessionRestartLocks.get(id) === recovery) sessionRestartLocks.delete(id);
  });
  sessionRestartLocks.set(id, recovery);
  return recovery;
}

export async function getPasskeyChallenge(id: string): Promise<Record<string, unknown>> {
  return call(`/api/${encodeURIComponent(id)}/auth/passkey/challenge`);
}

export async function submitPasskeyAssertion(
  id: string,
  assertion: Record<string, unknown>,
): Promise<void> {
  await call(`/api/${encodeURIComponent(id)}/auth/passkey`, {
    method: "POST",
    body: JSON.stringify(assertion),
  });
}

export async function getPasskeyConfirmation(id: string): Promise<string> {
  const raw = await call(`/api/${encodeURIComponent(id)}/auth/passkey/confirmation`);
  const code = raw["code"];
  if (typeof code !== "string" || !code.trim()) {
    throw new GatewayError("Gateway tidak mengembalikan kode konfirmasi passkey.", 502);
  }
  return code.trim();
}

export async function confirmPasskey(id: string): Promise<void> {
  await call(`/api/${encodeURIComponent(id)}/auth/passkey/confirm`, { method: "POST" });
}

export async function logoutSession(id: string): Promise<void> {
  const res = await request(`/api/sessions/${encodeURIComponent(id)}/logout`, {
    method: "POST",
  });
  if (res.status === 400 || res.status === 404) return; // already gone
  if (res.status < 200 || res.status >= 300) {
    throw new GatewayError(`Kesalahan gateway: ${messageOf(res.body) || `HTTP ${res.status}`}`, 502);
  }
}

/** Ubah nomor lokal (628xxx / 08xxx / dst.) menjadi chatId WhatsApp (WAHA memakai "@c.us"). */
function toChatId(to: string): string {
  if (to.includes("@")) return to; // sudah berupa chatId (grup "@g.us", channel "@newsletter", dst.)
  return `${to.replace(/\D/g, "")}@c.us`;
}

/**
 * Nama mesin WAHA untuk sesi ini (NOWEB/GOWS/WEBJS), di-cache singkat.
 * Dipakai untuk memutuskan apakah gambar + tombol boleh dikirim sekaligus.
 */
const engineCache = new Map<string, { value: string; at: number }>();

async function sessionEngine(id: string): Promise<string> {
  const cached = engineCache.get(id);
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  let value = "";
  try {
    const res = await request(`/api/sessions/${encodeURIComponent(id)}`);
    const body = (res.body ?? {}) as Record<string, unknown>;
    const engine = body["engine"];
    const raw =
      typeof engine === "string"
        ? engine
        : engine && typeof engine === "object"
          ? (engine as Record<string, unknown>)["engine"]
          : body["config"] && typeof body["config"] === "object"
            ? (body["config"] as Record<string, unknown>)["engine"]
            : null;
    value = typeof raw === "string" ? raw.toUpperCase() : "";
  } catch {
    value = "";
  }
  engineCache.set(id, { value, at: Date.now() });
  return value;
}



async function sendMessageRequest(params: {
  sessionId: string;
  to: string;
  text: string;
  mediaUrl?: string | null;
  mediaType?: MediaType | null;
  mediaFilename?: string | null;
  footerText?: string | null;
  buttons?: TemplateButton[] | null;
}): Promise<{ id: string | null }> {
  const chatId = toChatId(params.to);
  const inline = extractInlineButtons(params.text);
  const buttons = [...(params.buttons ?? []), ...inline]
    .filter((b) => b.text && b.url)
    .slice(0, 3) as TemplateButton[];
  // Teks tanpa token tombol (saat tombol dikirim native) dan versi cadangan
  // yang menaruh tautan persis di posisi token.
  const cleanText = inline.length ? stripButtonTokens(params.text) : params.text;
  const fallbackText = inline.length ? inlineButtonsAsText(params.text) : params.text;
  const mediaUrl = params.mediaUrl?.trim() || null;
  const mediaType: MediaType = params.mediaType ?? (mediaUrl ? "image" : "text");

  const mediaFile = (url: string): Record<string, string> => {
    const inlineFile = url.match(/^data:([^;,]+);base64,(.+)$/s);
    if (!inlineFile) {
      return params.mediaFilename ? { url, filename: params.mediaFilename } : { url };
    }

    const inlineData = inlineFile[2] ?? "";
    const detectedMime = inlineData.startsWith("/9j/")
      ? "image/jpeg"
      : inlineData.startsWith("iVBOR")
        ? "image/png"
        : inlineData.startsWith("R0lGOD")
          ? "image/gif"
          : inlineFile[1] ?? "application/octet-stream";
    const detectedExtension = detectedMime === "image/jpeg"
      ? "jpg"
      : detectedMime === "image/png"
        ? "png"
        : detectedMime === "image/gif"
          ? "gif"
          : "bin";
    return {
      mimetype: detectedMime,
      filename: params.mediaFilename ?? (mediaType === "image" ? `kampanye.${detectedExtension}` : "lampiran"),
      data: inlineData,
    };
  };

  // WAHA Plus/NOWEB dapat mengirim gambar, caption, dan tombol dalam satu
  // pesan melalui headerImage. Mesin lain (GOWS/WEBJS) menerima permintaan
  // dengan HTTP 200 tetapi membuang gambarnya, jadi hanya NOWEB yang dicoba.
  if (buttons.length && mediaUrl && mediaType !== "text") {
    if (mediaType === "image" && (await sessionEngine(params.sessionId)) === "NOWEB") {
      try {
        const raw = await call("/api/sendButtons", {
          method: "POST",
          body: JSON.stringify({
            session: params.sessionId,
            chatId,
            header: "",
            headerImage: mediaFile(mediaUrl),
            body: cleanText,
            footer: params.footerText ?? "",
            buttons: buttons.map((button) => ({
              type: "url",
              text: button.text,
              url: button.url,
            })),
          }),
        });
        console.info("Kampanye WhatsApp terkirim sebagai gambar + CTA native", {
          sessionId: params.sessionId,
          chatId,
          messageId: readMessageId(raw),
        });
        return { id: readMessageId(raw) };
      } catch (error) {
        if (!isUnsupportedMessageFeature(error)) throw error;
        console.warn(
          "WAHA tidak mendukung gambar + CTA native; CTA disatukan ke caption:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }


    const fallbackCaption = [
      cleanText,
      ...buttons.map((button) => `${button.text}\n${button.url}`),
    ]
      .filter(Boolean)
      .join("\n\n");
    return sendMessageRequest({
      ...params,
      text: fallbackCaption,
      buttons: null,
    });
  }

  // Interactive URL buttons: WAHA exposes them through /api/sendButtons.
  if (buttons.length) {
    try {
      const raw = await call("/api/sendButtons", {
        method: "POST",
        body: JSON.stringify({
          session: params.sessionId,
          chatId,
          header: "",
          body: cleanText,
          footer: params.footerText ?? "",
          buttons: buttons.map((b) => ({ type: "url", text: b.text, url: b.url })),
        }),
      });
      return { id: readMessageId(raw) };
    } catch (error) {
      if (!isUnsupportedMessageFeature(error)) throw error;
      console.warn(
        "WAHA sendButtons gagal; CTA dikirim sebagai tautan teks:",
        error instanceof Error ? error.message : String(error),
      );
      // Engine without button support: fall back to plain text with the links
      // kept at the position the user wrote them.
      const appended = [
        fallbackText,
        ...(inline.length ? [] : buttons.map((b) => `${b.text}\n${b.url}`)),
        params.footerText ?? "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const raw = await call("/api/sendText", {
        method: "POST",
        body: JSON.stringify({ session: params.sessionId, chatId, text: appended }),
      });
      return { id: readMessageId(raw) };
    }
  }

  const caption = [fallbackText, params.footerText ?? ""].filter(Boolean).join("\n\n");


  if (!mediaUrl || mediaType === "text") {
    const raw = await call("/api/sendText", {
      method: "POST",
      body: JSON.stringify({ session: params.sessionId, chatId, text: caption }),
    });
    return { id: readMessageId(raw) };
  }

  const path =
    mediaType === "image"
      ? "/api/sendImage"
      : mediaType === "video"
        ? "/api/sendVideo"
        : mediaType === "audio"
          ? "/api/sendVoice"
          : "/api/sendFile";

  const file = mediaFile(mediaUrl);

  const body: Record<string, unknown> = {
    session: params.sessionId,
    chatId,
    file,
  };
  if (mediaType !== "audio") body["caption"] = caption;

  const raw = await call(path, { method: "POST", body: JSON.stringify(body) });
  return { id: readMessageId(raw) };
}

/**
 * Serialize sends per device and repair a stale WAHA socket once before a
 * safe retry. A disconnected websocket has an unknown delivery outcome, so
 * it is deliberately never replayed (which could send the same message twice).
 */
export async function sendMessage(params: {
  sessionId: string;
  to: string;
  text: string;
  mediaUrl?: string | null;
  mediaType?: MediaType | null;
  mediaFilename?: string | null;
  footerText?: string | null;
  buttons?: TemplateButton[] | null;
}): Promise<{ id: string | null }> {
  return withSessionSendLock(params.sessionId, async () => {
    let state = await sessionStatus(params.sessionId);
    if (state.status !== "connected") {
      state = await reconnectSession(params.sessionId);
    }
    if (state.status !== "connected") {
      throw new GatewayError(
        "Perangkat WhatsApp belum siap. Pengiriman ditunda sampai perangkat tersambung kembali.",
        503,
      );
    }

    try {
      return await sendMessageRequest(params);
    } catch (error) {
      if (isUnknownDeliveryError(error)) {
        // Repair the socket for subsequent rows, but never replay this row.
        // Dibatasi: tidak lebih sering dari SESSION_RESTART_MIN_INTERVAL_MS per perangkat.
        if (shouldRestartSession(params.sessionId)) {
          await recoverSessionTransport(params.sessionId).catch(() => undefined);
        }
        throw new GatewayError(
          "Koneksi perangkat terputus saat mengirim. Pengiriman dihentikan sementara untuk mencegah pesan ganda.",
          503,
          true,
        );
      }
      if (!isStaleSessionError(error)) throw error;

      const recovered = await recoverSessionTransport(params.sessionId);
      if (recovered.status !== "connected") {
        throw new GatewayError(
          "Perangkat WhatsApp sedang menyambungkan ulang. Pengiriman akan dilanjutkan otomatis.",
          503,
        );
      }
      await sleep(1_500);
      return sendMessageRequest(params);
    }
  });
}

/** WAHA's message id shape varies by engine (NOWEB/GOWS/WEBJS). */
function readMessageId(raw: Record<string, unknown>): string | null {
  const idField = raw["id"];
  if (typeof idField === "string") return idField;
  if (idField && typeof idField === "object") {
    const serialized = (idField as Record<string, unknown>)["_serialized"];
    if (typeof serialized === "string") return serialized;
  }
  return null;
}

/**
 * Pairing by code: WAHA's POST /api/{session}/auth/request-code returns an
 * 8-character code the user types into WhatsApp (Perangkat tertaut ->
 * Tautkan dengan nomor telepon).
 */
export async function requestPairingCode(id: string, phone: string): Promise<string> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) {
    throw new GatewayError("Nomor telepon tidak valid untuk pemasangan dengan kode.", 400);
  }

  const cooldownKey = `${id}:${digits}`;
  const blockedUntil = pairingCooldowns.get(cooldownKey) ?? 0;
  if (blockedUntil > Date.now()) {
    const minutes = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 60_000));
    throw new GatewayError(
      `Permintaan kode masih dibatasi WhatsApp. Coba lagi sekitar ${minutes} menit lagi atau gunakan QR.`,
      429,
    );
  }

  // Keep a healthy SCAN_QR_CODE session alive. Recreating it for every click
  // burns WhatsApp's request-code quota and quickly causes rate-overlimit.
  // Only FAILED sessions need to be discarded before starting again.
  const existing = await findSession(id);
  if (existing?.status === "connected") {
    throw new GatewayError("Perangkat ini sudah terhubung. Putuskan terlebih dahulu untuk memasangkan ulang.", 409);
  }
  if (existing?.rawStatus === "FAILED") {
    const stopped = await request(`/api/sessions/${encodeURIComponent(id)}/stop`, { method: "POST" });
    if (stopped.status < 200 || (stopped.status >= 300 && stopped.status !== 404)) {
      throw new GatewayError(
        `Sesi pairing lama gagal dihentikan: ${messageOf(stopped.body) || `HTTP ${stopped.status}`}`,
        stopped.status >= 400 && stopped.status < 600 ? stopped.status : 502,
      );
    }
    const removed = await request(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (removed.status < 200 || (removed.status >= 300 && removed.status !== 404)) {
      throw new GatewayError(
        `Sesi pairing lama gagal direset: ${messageOf(removed.body) || `HTTP ${removed.status}`}`,
        removed.status >= 400 && removed.status < 600 ? removed.status : 502,
      );
    }
  }

  // A stopped/new session must reach SCAN_QR_CODE before a code can be issued.
  // startSession is idempotent and returns immediately for a ready session.
  const ready = await startSession(id);
  if (ready.status === "connected") {
    throw new GatewayError("Perangkat ini sudah terhubung.", 409);
  }

  let raw: Record<string, unknown>;
  try {
    raw = await call(`/api/${encodeURIComponent(id)}/auth/request-code`, {
      method: "POST",
      // Mengosongkan method meminta kode pairing web yang ditampilkan di aplikasi.
      // Nilai "sms"/"voice" adalah alur registrasi OTP yang berbeda.
      body: JSON.stringify({ phoneNumber: digits }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // WhatsApp membatasi jumlah permintaan kode per nomor dalam waktu singkat.
    if (/rate-overlimit|429/i.test(message)) {
      pairingCooldowns.set(cooldownKey, Date.now() + PAIRING_COOLDOWN_MS);
      throw new GatewayError(
        "WhatsApp sementara memblokir permintaan kode karena terlalu sering dicoba. Jangan minta kode berulang; tunggu setidaknya 60 menit sejak percobaan terakhir, lalu coba sekali lagi atau gunakan QR.",
        429,
      );
    }
    throw err;
  }

  const code = raw["code"] ?? raw["pairingCode"] ?? raw["data"];
  if (typeof code === "string" && code.trim()) {
    pairingCooldowns.delete(cooldownKey);
    return code.trim();
  }
  if (code && typeof code === "object") {
    const nested = (code as Record<string, unknown>)["code"];
    if (typeof nested === "string" && nested.trim()) {
      pairingCooldowns.delete(cooldownKey);
      return nested.trim();
    }
  }
  throw new GatewayError(
    "Gateway tidak mengembalikan kode pemasangan. Pastikan gateway mendukung pairing dengan kode.",
    502,
  );
}

/* ------------------------------------------------------------------ *
 * Profil WhatsApp (WAHA):
 *   GET /api/{session}/profile          -> { id, name, picture }
 *   PUT /api/{session}/profile/name     -> { name }
 *   PUT /api/{session}/profile/picture  -> { file: { mimetype, filename, data|url } }
 * ------------------------------------------------------------------ */

export interface WaProfile {
  id: string | null;
  phone: string | null;
  name: string | null;
  picture: string | null;
}

export async function getWaProfile(sessionId: string): Promise<WaProfile> {
  const raw = await call(`/api/${encodeURIComponent(sessionId)}/profile`);
  const id = typeof raw["id"] === "string" ? (raw["id"] as string) : null;
  const picture = raw["picture"];
  return {
    id,
    phone: digits(id),
    name: typeof raw["name"] === "string" ? (raw["name"] as string) : null,
    picture:
      typeof picture === "string"
        ? picture
        : picture && typeof picture === "object"
          ? ((picture as Record<string, unknown>)["url"] as string | undefined) ?? null
          : null,
  };
}

export async function setWaProfileName(sessionId: string, name: string): Promise<void> {
  await call(`/api/${encodeURIComponent(sessionId)}/profile/name`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

/** `data` adalah base64 murni (tanpa prefix data:), `mimetype` mis. image/jpeg. */
export async function setWaProfilePicture(
  sessionId: string,
  file: { mimetype: string; filename: string; data: string },
): Promise<void> {
  await call(`/api/${encodeURIComponent(sessionId)}/profile/picture`, {
    method: "PUT",
    body: JSON.stringify({ file }),
  });
}
