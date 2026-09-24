/* eslint-disable @typescript-eslint/no-explicit-any */
/** Cache daftar Black List nomor pengirim (30 detik). */
let cache: { at: number; phones: Set<string> } | null = null;

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function clearBlacklistCache() {
  cache = null;
}

export async function isSenderBlacklisted(supabase: any, phone: string | null): Promise<boolean> {
  const p = digits(phone);
  if (!p) return false;
  if (!cache || Date.now() - cache.at > 30_000) {
    const { data, error } = await supabase.from("sender_blacklist").select("phone");
    // Tabel belum dibuat → anggap tidak ada yang diblokir.
    const phones = new Set<string>(
      error ? [] : ((data ?? []) as { phone: string }[]).map((r) => digits(r.phone)),
    );
    cache = { at: Date.now(), phones };
  }
  return cache.phones.has(p);
}
