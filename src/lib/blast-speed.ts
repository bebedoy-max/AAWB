/** Pilihan kecepatan blast yang dipakai member maupun kampanye admin. */

export interface BlastSpeed {
  value: string;
  label: string;
  description: string;
  min: number;
  max: number;
}

export const BLAST_SPEEDS: readonly BlastSpeed[] = [
  { value: "kilat", label: "Kilat", description: "Hampir tanpa jeda (tercepat)", min: 1, max: 1 },
  { value: "brutal", label: "Brutal", description: "Jeda 1–3 detik", min: 1, max: 3 },
  { value: "santai", label: "Santai", description: "Jeda 4–6 detik", min: 4, max: 6 },
  { value: "slow", label: "Slow", description: "Jeda 15–20 detik", min: 15, max: 20 },
  { value: "siput", label: "Siput", description: "Jeda 30–50 detik", min: 30, max: 50 },
] as const;

export function speedByValue(value: string | null | undefined): BlastSpeed {
  return BLAST_SPEEDS.find((s) => s.value === value) ?? BLAST_SPEEDS[2]!;
}

/** Jeda acak (ms) antar pesan untuk kecepatan tertentu. */
export function speedDelayMs(value: string | null | undefined): number {
  const s = speedByValue(value);
  const seconds = s.min + Math.random() * Math.max(0, s.max - s.min);
  return Math.round(seconds * 1000);
}
