/** Phone sanitizing, spintax and template-variable helpers. */

/**
 * Normalizes a phone number to international format without a leading `+`.
 * Indonesian style leading `0` becomes the country code (default 62).
 */
export function sanitizePhone(input: string, countryCode = "62"): string {
  let digits = (input ?? "").replace(/[^\d+]/g, "");
  digits = digits.replace(/^\+/, "");
  digits = digits.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return countryCode + digits.replace(/^0+/, "");
  if (digits.startsWith(countryCode)) return digits;
  if (digits.length <= 11 && !digits.startsWith(countryCode)) return countryCode + digits;
  return digits;
}

export function isValidPhone(input: string): boolean {
  const p = sanitizePhone(input);
  return p.length >= 8 && p.length <= 16;
}

export function formatPhoneDisplay(phone: string): string {
  const p = sanitizePhone(phone);
  if (!p) return "";
  return "+" + p.replace(/(\d{2})(\d{3})(\d{4})(\d+)?/, (_m, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(" "),
  );
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
