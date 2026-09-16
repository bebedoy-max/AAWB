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


export interface GatewaySessionState {
  status: WaSessionStatus;
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
      res.status >= 400 && res.status < 600 ? res.status : 502,
    );
  }
  return (res.body && typeof res.body === "object" ? res.body : {}) as Record<string, unknown>;
}

/** Peta status mentah WAHA (STOPPED/STARTING/SCAN_QR_CODE/WORKING/FAILED) ke status internal AAWB. */
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

/**
 * Ask WAHA for a fresh QR. WAHA only serves the QR while the session's status
 * is SCAN_QR_CODE, so after creating/starting the session we poll briefly for
 * that status before fetching it.
 */
export async function startSession(id: string): Promise<GatewaySessionState> {
  let existing = await findSession(id);

  if (existing?.status === "connected") return existing;

  // Preserve the stored WhatsApp credentials when a session crashes. A clean
  // stop lets WAHA reset the engine without deleting the paired session.
  if (existing?.rawStatus === "FAILED") {
    const stopped = await request(`/api/sessions/${encodeURIComponent(id)}/stop`, {
      method: "POST",
    });
    if (stopped.status >= 200 && stopped.status < 300) {
      existing = await findSession(id);
    } else {
      throw new GatewayError(
        `Sesi WhatsApp gagal dipulihkan: ${messageOf(stopped.body) || `HTTP ${stopped.status}`}`,
        stopped.status >= 400 && stopped.status < 600 ? stopped.status : 502,
      );
    }
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
        "Sesi WhatsApp gagal dimulai oleh gateway. Sesi sudah dibuat ulang; silakan coba sekali lagi.",
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
  return state ?? { status: "disconnected", qr: null, phone: null, battery: null };
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

  // Attachment + buttons: send the media (with its caption) first, then the
  // interactive message carrying the buttons.
  if (buttons.length && mediaUrl && mediaType !== "text") {
    await sendMessage({ ...params, text: fallbackText, buttons: null });
    return sendMessage({
      ...params,
      mediaUrl: null,
      mediaType: "text",
      text: params.footerText?.trim() || "Pilih tombol di bawah 👇",
      footerText: null,
      buttons,
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
    } catch {
      // Engine without button support: fall back to plain text with the links
      // kept at the position the user wrote them.
      const appended = [
        fallbackText,
        ...(inline.length ? [] : buttons.map((b) => `\u{1F449} ${b.text}: ${b.url}`)),
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

  const file: Record<string, string> = { url: mediaUrl };
  if (params.mediaFilename) file["filename"] = params.mediaFilename;

  const body: Record<string, unknown> = {
    session: params.sessionId,
    chatId,
    file,
  };
  if (mediaType !== "audio") body["caption"] = caption;

  const raw = await call(path, { method: "POST", body: JSON.stringify(body) });
  return { id: readMessageId(raw) };
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

  // The session must be running (SCAN_QR_CODE) before a code can be issued.
  await startSession(id);

  const raw = await call(`/api/${encodeURIComponent(id)}/auth/request-code`, {
    method: "POST",
    // Mengosongkan method meminta kode pairing web yang ditampilkan di aplikasi.
    // Nilai "sms"/"voice" adalah alur registrasi OTP yang berbeda.
    body: JSON.stringify({ phoneNumber: digits }),
  });

  const code = raw["code"] ?? raw["pairingCode"] ?? raw["data"];
  if (typeof code === "string" && code.trim()) return code.trim();
  if (code && typeof code === "object") {
    const nested = (code as Record<string, unknown>)["code"];
    if (typeof nested === "string" && nested.trim()) return nested.trim();
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
