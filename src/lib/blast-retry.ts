/**
 * Kebijakan percobaan ulang blast. Murni (tanpa dependensi server) supaya mudah diuji.
 *
 * Aturan (keputusan owner):
 *  - Hasil TIDAK PASTI dan penolakan tingkat-perangkat diulang otomatis oleh perangkat
 *    lain sampai berhasil, KECUALI nomornya tidak valid (final).
 *  - Pesan yang PASTI belum terkirim (perangkat belum siap, gateway tidak terjangkau)
 *    dikembalikan ke antrean tanpa menghabiskan percobaan.
 *  - Ada batas percobaan agar pesan bermasalah tidak berputar selamanya.
 */

/** Batas percobaan untuk hasil tidak pasti / penolakan perangkat sebelum ditutup sebagai gagal. */
export const RETRY_MAX_ATTEMPTS = 8;
/** Kegagalan beruntun pada satu perangkat sebelum perangkat itu didinginkan. */
export const BREAKER_THRESHOLD = 3;
/** Pesan berstatus "processing" lebih lama dari ini dianggap tidak pasti dan diulang. */
export const PROCESSING_TIMEOUT = "5 minutes";

export type FailureClass = "invalid" | "device_reject" | "not_sent" | "unknown" | "other";

export interface FailureLike {
  message?: string;
  status?: number;
  deliveryUnknown?: boolean;
}

// Nomor tidak terdaftar / tidak valid: hasilnya tidak akan berubah bila diulang.
const INVALID_NUMBER =
  /tidak terdaftar di whatsapp|not registered|not on whatsapp|nomor (?:tidak valid|salah)|invalid (?:phone|number|jid)|bad jid/i;
// WhatsApp menolak lewat perangkat ini (mis. kode 463, nomor dibatasi): perangkat lain masih bisa mencoba.
const DEVICE_REJECT = /ditolak server whatsapp|dibatasi whatsapp|ditahan sampai/i;
// Gagal SEBELUM pesan sampai ke WhatsApp: pasti belum terkirim.
const NOT_SENT =
  /perangkat whatsapp|session status is not as expected|belum siap|menyambungkan ulang|tidak dapat terhubung ke gateway|gateway menolak permintaan/i;

export function classifyFailure(err: FailureLike): FailureClass {
  const message = String(err?.message ?? "");
  if (INVALID_NUMBER.test(message)) return "invalid";
  if (err?.deliveryUnknown) return "unknown";
  if (DEVICE_REJECT.test(message)) return "device_reject";
  if (NOT_SENT.test(message)) return "not_sent";
  return "other";
}

/** Jeda sebelum percobaan berikutnya: 2, 4, 8, 16, lalu 30 menit. */
export function backoffMs(attempts: number): number {
  const n = Math.max(1, Math.min(Math.floor(attempts) || 1, 5));
  return Math.min(30, 2 ** n) * 60_000;
}

const CONNECT_PHASE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/** true bila permintaan gagal SEBELUM tersambung ke gateway (pesan pasti belum terkirim). */
export function isConnectPhaseNetworkError(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null | undefined;
  return CONNECT_PHASE_CODES.has(String(e?.cause?.code ?? e?.code ?? ""));
}
