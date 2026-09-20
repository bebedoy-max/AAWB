/**
 * Menentukan apakah sebuah event auth berarti AKUN BERGANTI (login, logout, atau
 * profil berubah), sehingga cache data dan rute perlu dibuang.
 *
 * Latar belakang: supabase-js memancarkan `SIGNED_IN` lagi setiap kali pengguna
 * kembali ke tab (sesi dipulihkan ulang), padahal akunnya sama. Tanpa mengetahui
 * siapa yang sedang masuk, event pertama seperti itu dikira login baru: cache
 * dikosongkan dan halaman terpasang ulang, sehingga isian formulir yang belum
 * disimpan (mis. teks kampanye) hilang. Karena itu `lastUserId` harus diisi dari
 * sesi yang sudah ada (event `INITIAL_SESSION` atau getSession) sebelum event lain
 * diproses.
 */
export type AuthEventState = {
  /** undefined = belum diketahui; null = belum ada yang masuk; string = id pengguna. */
  lastUserId: string | null | undefined;
};

/** true bila cache dan rute harus di-reset. Memperbarui `state`. */
export function authEventNeedsReset(
  state: AuthEventState,
  event: string,
  userId: string | null,
): boolean {
  if (event === "INITIAL_SESSION") {
    if (state.lastUserId === undefined) state.lastUserId = userId;
    return false;
  }
  if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return false;
  // Pengguna yang sama menyala kembali (mis. kembali ke tab): bukan pergantian akun.
  if (event === "SIGNED_IN" && userId === state.lastUserId) return false;
  state.lastUserId = userId;
  return true;
}
