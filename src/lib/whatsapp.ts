/** Phone sanitizing, spintax and template-variable helpers. */

import { countryFromNumber } from "@/lib/countries";

/**
 * Normalizes a phone number to international format without a leading `+`.
 *
 * - `+<anything>` is treated as already international and kept as-is.
 * - A local leading `0` is replaced with the given country code.
 * - A bare national number gets the country code prefixed, unless it already
 *   starts with a known dial code and is long enough to be international.
 */
export function sanitizePhone(input: string, countryCode = "62"): string {
  const raw = (input ?? "").trim();
  const cc = (countryCode || "62").replace(/\D/g, "");
  const hadPlus = /^\s*\+/.test(raw) || /^00\d/.test(raw.replace(/\D/g, "").slice(0, 3));
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  // 00 prefix is the international access code in many countries.
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (hadPlus) return digits.slice(0, 16);

  if (digits.startsWith("0")) return cc + digits.replace(/^0+/, "");
  if (digits.startsWith(cc)) return digits;

  // Indonesian mobile numbers are commonly entered without the leading zero
  // (812..., 823...). Treat those as national numbers before trying to infer
  // another country's calling code such as South Korea's 82.
  if (cc === "62" && digits.startsWith("8")) return cc + digits;

  // Already international for another country (e.g. 4479..., 15551234567).
  const guessed = countryFromNumber(digits);
  if (guessed && digits.length >= guessed.dial.length + 7) return digits;

  return cc + digits;
}

export function isValidPhone(input: string, countryCode = "62"): boolean {
  const p = sanitizePhone(input, countryCode);
  return p.length >= 8 && p.length <= 16;
}

export function formatPhoneDisplay(phone: string): string {
  const p = (phone ?? "").replace(/\D/g, "");
  if (!p) return "";
  const country = countryFromNumber(p);
  if (!country) return "+" + p;
  const rest = p.slice(country.dial.length);
  const grouped = rest.replace(/(\d{3,4})(?=\d)/g, "$1 ").trim();
  return `+${country.dial} ${grouped}`.trim();
}

/**
 * Parses a pasted blob of phone numbers (one per line, or separated by
 * commas / semicolons / spaces). Returns unique international numbers.
 * Lines shaped like `Nama, 0812...` keep the leading text as the name.
 */
export function parsePhoneList(
  text: string,
  countryCode = "62",
): Array<{ name: string; phone: string }> {
  const out: Array<{ name: string; phone: string }> = [];
  const seen = new Set<string>();

  for (const rawLine of (text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(/[,;\t|]+/).map((p) => p.trim()).filter(Boolean);
    let name = "";
    let numberPart = line;

    if (parts.length > 1) {
      const numeric = parts.filter((p) => (p.match(/\d/g) ?? []).length >= 7);
      if (numeric.length === 1) {
        numberPart = numeric[0]!;
        name = parts.filter((p) => p !== numeric[0]).join(" ").trim();
      } else {
        // Several numbers on one line: treat each separately.
        for (const p of parts) {
          const phone = sanitizePhone(p, countryCode);
          if (isValidPhone(p, countryCode) && !seen.has(phone)) {
            seen.add(phone);
            out.push({ name: phone, phone });
          }
        }
        continue;
      }
    } else {
      // "Nama 08123..." — split the trailing number off the label.
      const match = line.match(/^(.*?)([+\d][\d\s().-]{6,})$/);
      if (match && match[1]!.trim() && /[A-Za-z]/.test(match[1]!)) {
        name = match[1]!.trim().replace(/[-:]+$/, "").trim();
        numberPart = match[2]!;
      }
    }

    const phone = sanitizePhone(numberPart, countryCode);
    if (!phone || phone.length < 8 || phone.length > 16) continue;
    if (seen.has(phone)) continue;
    seen.add(phone);
    out.push({ name: name || phone, phone });
  }

  return out;
}

/** Resolves `{a|b|c}` spintax groups, picking one option per group. */
export function resolveSpintax(text: string, pick?: (options: string[]) => string): string {
  const choose = pick ?? ((options: string[]) => options[Math.floor(Math.random() * options.length)]!);
  let out = text ?? "";
  let guard = 0;
  const pattern = /\{([^{}]*)\}/;
  while (pattern.test(out) && guard < 50) {
    out = out.replace(pattern, (_match, group: string) => {
      if (!group.includes("|")) return `\u0000${group}\u0001`;
      return choose(group.split("|"));
    });
    guard += 1;
  }
  return out.replace(/\u0000/g, "{").replace(/\u0001/g, "}");
}

/** Counts how many unique message variations a spintax string can produce. */
export function countSpintaxVariations(text: string): number {
  const groups = (text ?? "").match(/\{[^{}]*\|[^{}]*\}/g) ?? [];
  return groups.reduce((acc, g) => acc * g.slice(1, -1).split("|").length, 1);
}

export const TEMPLATE_VARIABLES = ["name", "phone", "var1", "var2", "var3"] as const;

/** Replaces `{{name}}` style variables with values from the contact record. */
export function renderTemplate(content: string, vars: Record<string, string>): string {
  return (content ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

/** Full pipeline used by the dispatcher: variables first, then spintax. */
export function buildMessageBody(content: string, vars: Record<string, string>): string {
  return resolveSpintax(renderTemplate(content, vars)).trim();
}

/* ------------------------------------------------------------------ *
 * Tombol klik yang ditulis langsung di dalam kolom pesan.
 * Format token: [[tombol:Teks|https://tujuan]]
 * ------------------------------------------------------------------ */

export const BUTTON_TOKEN_PATTERN = /\[\[tombol:([^|\]]+)\|([^\]]+)\]\]/gi;

export function buttonToken(text: string, url: string): string {
  return `[[tombol:${text}|${url}]]`;
}

export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "button"; text: string; url: string };

/** Memecah isi pesan menjadi potongan teks dan tombol sesuai urutan penulisan. */
export function parseMessageParts(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const source = content ?? "";
  const re = new RegExp(BUTTON_TOKEN_PATTERN.source, "gi");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (m.index > last) parts.push({ kind: "text", text: source.slice(last, m.index) });
    parts.push({ kind: "button", text: (m[1] ?? "").trim(), url: (m[2] ?? "").trim() });
    last = m.index + m[0].length;
  }
  if (last < source.length) parts.push({ kind: "text", text: source.slice(last) });
  return parts;
}

/** Tombol yang ditulis di dalam pesan, berurutan sesuai posisinya. */
export function extractInlineButtons(content: string): Array<{ text: string; url: string }> {
  return parseMessageParts(content)
    .filter((p): p is { kind: "button"; text: string; url: string } => p.kind === "button")
    .filter((p) => p.text && p.url);
}

/** Isi pesan tanpa token tombol (dipakai saat tombol dikirim secara native). */
export function stripButtonTokens(content: string): string {
  return (content ?? "")
    .replace(new RegExp(BUTTON_TOKEN_PATTERN.source, "gi"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Isi pesan dengan token diganti tautan di posisi aslinya (mode cadangan). */
export function inlineButtonsAsText(content: string): string {
  return (content ?? "")
    .replace(new RegExp(BUTTON_TOKEN_PATTERN.source, "gi"), (_m, t: string, u: string) =>
      `\u{1F449} ${t.trim()}: ${u.trim()}`,
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


/** Random anti-ban delay, in seconds, between min and max. */
export function randomDelay(min: number, max: number): number {
  const lo = Math.max(1, Math.min(min, max));
  const hi = Math.max(lo, max);
  return lo + Math.random() * (hi - lo);
}

/** Exponential backoff in ms with jitter, used by the queue worker. */
export function backoffMs(attempt: number, baseMs = 800, capMs = 30_000): number {
  const expo = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(expo * (0.7 + Math.random() * 0.6));
}
