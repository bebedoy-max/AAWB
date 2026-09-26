import type { WaSessionStatus } from "@/types/wa";

export interface DeviceConnectionState {
  status: WaSessionStatus;
  raw_status?: string | null;
  restricted_until?: string | null;
  restrict_reason?: string | null;
}

/** Only the gateway's explicit restriction is evidence of a WhatsApp limit. */
export function deviceConnectionInfo(state: DeviceConnectionState, now = Date.now()): string {
  if (state.status === "connected") return "Perangkat terhubung.";

  const until = state.restricted_until ? new Date(state.restricted_until).getTime() : NaN;
  const restricted = state.restricted_until && Number.isFinite(until)
    ? until > now
    : Boolean(state.restrict_reason);
  if (restricted) {
    if (Number.isFinite(until) && until > now) {
      const remaining = Math.ceil((until - now) / 60_000);
      const wait = remaining >= 60 ? `sekitar ${Math.ceil(remaining / 60)} jam` : `sekitar ${remaining} menit`;
      return `WhatsApp sedang membatasi perangkat ini. Coba hubungkan lagi ${wait} lagi (setelah ${new Date(until).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}). Jangan mencoba berulang selama pembatasan berlangsung.`;
    }
    return "WhatsApp sedang membatasi perangkat ini. Waktu berakhirnya belum tersedia; tunggu sebelum mencoba menghubungkan lagi, dan periksa pemberitahuan di WhatsApp ponsel.";
  }

  if (state.status === "connecting") return "Menunggu perangkat ditautkan lewat WhatsApp di ponsel. Jika terlalu lama, perbarui QR atau minta kode baru setelah kode lama kedaluwarsa.";
  if (state.raw_status === "FAILED") return "Sesi perangkat gagal tersambung. Coba hubungkan ulang; jika masih gagal, periksa WhatsApp di ponsel dan hubungi bantuan.";
  if (state.raw_status === "STOPPED") return "Sesi perangkat terhenti. Penyebab pastinya tidak dilaporkan; periksa koneksi ponsel dan Perangkat tertaut di WhatsApp, lalu coba hubungkan ulang.";
  return "Perangkat belum tersambung. Penyebab pastinya belum tersedia; periksa koneksi ponsel dan Perangkat tertaut di WhatsApp, lalu coba hubungkan ulang.";
}