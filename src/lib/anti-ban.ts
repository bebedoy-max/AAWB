/**
 * Logika Anti Ban. Semua fungsi di sini HANYA dipakai ketika opsi "Anti Ban"
 * dicentang pada kampanye. Tanpa opsi itu, pengiriman tetap memakai jeda tetap
 * sesuai pengaturan kecepatan.
 */

/** Jeda acak (detik) antara min–max untuk setiap pesan. */
export function antiBanDelaySeconds(min: number, max: number): number {
  const lo = Math.max(0, Number.isFinite(min) ? min : 0);
  const hi = Math.max(lo, Number.isFinite(max) ? max : lo);
  return lo + Math.random() * (hi - lo);
}

/** Ukuran batch acak: jeda panjang disisipkan setiap 20–30 pesan. */
export function antiBanBatchSize(): number {
  return 20 + Math.floor(Math.random() * 11);
}

/** Jeda panjang acak antar batch: 2–5 menit, dalam detik. */
export function antiBanLongPauseSeconds(): number {
  return 120 + Math.random() * 180;
}

/** Mengacak urutan daftar (Fisher–Yates), tanpa mengubah array asal. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Variasi kecil di akhir pesan supaya setiap pesan tidak identik. */
const MESSAGE_SUFFIXES = [
  "",
  ".",
  "..",
  "...",
  ",",
  ",,",
  " :)",
  " :-)",
  " >,<",
  " ^^",
  " 🙂",
  " 👍",
  " ✨",
  " 🙏",
  "~",
  " !",
  " !!",
] as const;

/** Menambahkan variasi acak di akhir isi pesan. */
export function varyMessage(body: string): string {
  const base = (body ?? "").replace(/\s+$/, "");
  const suffix = MESSAGE_SUFFIXES[Math.floor(Math.random() * MESSAGE_SUFFIXES.length)]!;
  return `${base}${suffix}`;
}

/** Kata kunci berhenti berlangganan pada balasan penerima. */
export const STOP_KEYWORDS = ["stop", "berhenti", "unsub", "unsubscribe"] as const;

export function isStopMessage(text: string): boolean {
  const normalized = (text ?? "").toLowerCase().replace(/[^a-z ]/g, " ").trim();
  if (!normalized) return false;
  return STOP_KEYWORDS.some((k) => new RegExp(`(^|\\s)${k}(\\s|$)`).test(normalized));
}

/** Pesan gagal yang menandakan nomor tidak valid / tidak aktif di WhatsApp. */
export function isInvalidNumberError(message: string): boolean {
  return /not\s*(a\s*)?(valid|registered|exist)|invalid number|nomor tidak|not on whatsapp|jid|no account/i.test(
    message ?? "",
  );
}
