/** Format angka rupiah untuk tampilan reward & penarikan. */
export function rupiah(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}
