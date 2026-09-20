/**
 * Pembatas laju sederhana di memori proses (satu instance aplikasi).
 * Dipakai sebagai lapisan tambahan; batas per-akun yang kuat ada di database.
 * Hanya boleh diimpor dari kode server (nama berkas .server).
 */
const buckets = new Map<string, number[]>();

/** true bila `key` sudah melewati `limit` permintaan dalam `windowMs`. Bila belum, permintaan ini dicatat. */
export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return true;
  }
  recent.push(now);
  buckets.set(key, recent);

  // Bersihkan entri lama supaya memori tidak membengkak.
  if (buckets.size > 5000) {
    for (const [k, times] of buckets) {
      if (!times.length || now - (times[times.length - 1] ?? 0) > windowMs) buckets.delete(k);
    }
  }
  return false;
}

/** Alamat klien terbaik yang tersedia dari header proxy (Cloudflare/Traefik). Sifatnya perkiraan. */
export function clientIp(request: Request | undefined | null): string {
  const h = request?.headers;
  const cf = h?.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = h?.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return h?.get("x-real-ip")?.trim() || "unknown";
}
