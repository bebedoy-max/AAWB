/**
 * Preset kecepatan blast tingkat SISTEM (batas atas per nomor pengirim), diatur admin.
 * Murni (tanpa dependensi server) supaya dipakai bersama oleh halaman admin dan server.
 *
 * Catatan: mode kecepatan yang dipilih worker (Kilat/Brutal/Santai/…) tetap bisa MEMPERLAMBAT,
 * tidak bisa lebih cepat dari batas sistem ini.
 */

export type BlastPresetId = "slow" | "normal" | "cepat" | "brutal";
export type BlastPresetOrCustom = BlastPresetId | "kustom";

export interface BlastSpeedValues {
  /** Jeda minimal antar pesan per nomor mapan (detik). */
  minDelaySec: number;
  /** Jeda maksimal antar pesan per nomor mapan (detik). */
  maxDelaySec: number;
  /** Maks pesan per jam per nomor. 0 = tidak dibatasi; maksimum 1000 bila aktif. */
  hourlyCap: number;
  /** Maks pesan per 24 jam per nomor. 0 = tidak dibatasi. */
  dailyCap: number;
  /** Nomor dengan kiriman di bawah angka ini dianggap nomor baru (pemanasan). */
  warmupCount: number;
  /** Jeda minimal untuk nomor baru (detik). */
  warmupMinSec: number;
  /** Jeda maksimal untuk nomor baru (detik). */
  warmupMaxSec: number;
  /** Maks perangkat per satu nomor pengirim yang boleh dipakai blast (1–4). Fitur tersembunyi. */
  maxDevicesPerNumber: number;
}

export interface BlastPreset {
  id: BlastPresetId;
  label: string;
  description: string;
  /** Perkiraan pesan per menit untuk nomor mapan (mode worker Kilat/Brutal). */
  perMinute: string;
  warning?: string;
  values: BlastSpeedValues;
}

/** Urutan dari paling cepat ke paling aman. Rem otomatis turun satu langkah ke kanan. */
export const BLAST_PRESET_ORDER: readonly BlastPresetId[] = ["brutal", "cepat", "normal", "slow"];

export const BLAST_PRESETS: Record<BlastPresetId, BlastPreset> = {
  brutal: {
    id: "brutal",
    label: "Brutal",
    description: "Jeda 1–2 detik per nomor mapan. Hanya untuk nomor yang benar-benar mapan.",
    perMinute: "±15–25 / menit",
    warning:
      "Pada uji 22 Sep, laju ini membuat WhatsApp memutus koneksi perangkat berulang kali sehingga " +
      "kecepatan nyata justru turun dan muncul pesan tidak pasti (bisa terkirim ganda). Pantau Monitor Blast.",
    values: {
      minDelaySec: 1,
      maxDelaySec: 2,
      hourlyCap: 1000,
      dailyCap: 3000,
      warmupCount: 15,
      warmupMinSec: 8,
      warmupMaxSec: 12,
      maxDevicesPerNumber: 4,
    },
  },
  cepat: {
    id: "cepat",
    label: "Cepat",
    description: "Jeda 4–5 detik per nomor mapan. Terbukti stabil pada blast 21–22 Sep.",
    perMinute: "±8–10 / menit",
    values: {
      minDelaySec: 4,
      maxDelaySec: 5,
      hourlyCap: 600,
      dailyCap: 1500,
      warmupCount: 30,
      warmupMinSec: 12,
      warmupMaxSec: 20,
      maxDevicesPerNumber: 3,
    },
  },
  normal: {
    id: "normal",
    label: "Normal",
    description: "Jeda 8–15 detik per nomor mapan. Seimbang antara kecepatan dan umur nomor.",
    perMinute: "±4–6 / menit",
    values: {
      minDelaySec: 8,
      maxDelaySec: 15,
      hourlyCap: 240,
      dailyCap: 800,
      warmupCount: 30,
      warmupMinSec: 20,
      warmupMaxSec: 40,
      maxDevicesPerNumber: 2,
    },
  },
  slow: {
    id: "slow",
    label: "Slow",
    description: "Jeda 15–20 detik per nomor mapan. Paling aman untuk nomor worker.",
    perMinute: "±2–3 / menit",
    values: {
      minDelaySec: 15,
      maxDelaySec: 20,
      hourlyCap: 120,
      dailyCap: 500,
      warmupCount: 30,
      warmupMinSec: 30,
      warmupMaxSec: 60,
      maxDevicesPerNumber: 1,
    },
  },
};

export function isBlastPresetId(value: unknown): value is BlastPresetId {
  return typeof value === "string" && value in BLAST_PRESETS;
}

/** Preset berikutnya yang lebih aman, atau null bila sudah paling aman. */
export function saferPreset(current: BlastPresetOrCustom): BlastPresetId | null {
  if (current === "kustom") return "normal";
  const i = BLAST_PRESET_ORDER.indexOf(current);
  if (i < 0) return "normal";
  return BLAST_PRESET_ORDER[i + 1] ?? null;
}

/** Preset yang nilainya sama persis, atau "kustom". */
export function matchPreset(values: BlastSpeedValues): BlastPresetOrCustom {
  const keys = Object.keys(SPEED_COLUMNS) as (keyof BlastSpeedValues)[];
  for (const id of BLAST_PRESET_ORDER) {
    const v = BLAST_PRESETS[id].values;
    if (keys.every((k) => v[k] === values[k])) return id;
  }
  return "kustom";
}

/** Batas yang juga dipaksa di member-worker.server.ts; di sini untuk validasi form. */
export const SPEED_LIMITS = {
  minDelaySec: { min: 1, max: 3600 },
  maxDelaySec: { min: 1, max: 3600 },
  hourlyCap: { min: 0, max: 1000 },
  dailyCap: { min: 0, max: 100_000 },
  warmupCount: { min: 0, max: 10_000 },
  warmupMinSec: { min: 1, max: 3600 },
  warmupMaxSec: { min: 1, max: 3600 },
  maxDevicesPerNumber: { min: 1, max: 4 },
} as const;

/** Periksa nilai; kembalikan pesan galat pertama, atau null bila valid. */
export function validateSpeedValues(v: BlastSpeedValues): string | null {
  const names: Record<keyof BlastSpeedValues, string> = {
    minDelaySec: "Jeda minimal",
    maxDelaySec: "Jeda maksimal",
    hourlyCap: "Batas per jam",
    dailyCap: "Batas per hari",
    warmupCount: "Ambang nomor mapan",
    warmupMinSec: "Jeda minimal nomor baru",
    warmupMaxSec: "Jeda maksimal nomor baru",
    maxDevicesPerNumber: "Max Perangkat Per Nomor",
  };
  for (const key of Object.keys(SPEED_LIMITS) as (keyof BlastSpeedValues)[]) {
    const n = v[key];
    const { min, max } = SPEED_LIMITS[key];
    if (!Number.isFinite(n) || !Number.isInteger(n)) return `${names[key]} harus bilangan bulat.`;
    if (n < min || n > max) return `${names[key]} harus antara ${min} dan ${max}.`;
  }
  if (v.maxDelaySec < v.minDelaySec) return "Jeda maksimal tidak boleh lebih kecil dari jeda minimal.";
  if (v.warmupMaxSec < v.warmupMinSec) {
    return "Jeda maksimal nomor baru tidak boleh lebih kecil dari jeda minimalnya.";
  }
  if (v.warmupMinSec < v.minDelaySec) {
    return "Jeda nomor baru tidak boleh lebih cepat dari jeda nomor mapan.";
  }
  return null;
}

/** Nama kolom app_settings untuk tiap nilai. */
export const SPEED_COLUMNS: Record<keyof BlastSpeedValues, string> = {
  minDelaySec: "blast_min_delay_sec",
  maxDelaySec: "blast_max_delay_sec",
  hourlyCap: "blast_hourly_cap",
  dailyCap: "blast_daily_cap",
  warmupCount: "blast_warmup_count",
  warmupMinSec: "blast_warmup_min_sec",
  warmupMaxSec: "blast_warmup_max_sec",
  maxDevicesPerNumber: "blast_max_devices_per_number",
};

export function valuesToColumns(v: BlastSpeedValues): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(SPEED_COLUMNS) as (keyof BlastSpeedValues)[]) {
    out[SPEED_COLUMNS[key]] = v[key];
  }
  return out;
}

export function columnsToValues(row: Record<string, unknown> | null | undefined): BlastSpeedValues {
  const d = BLAST_PRESETS.cepat.values;
  const num = (k: keyof BlastSpeedValues) => {
    const n = Number(row?.[SPEED_COLUMNS[k]]);
    return Number.isFinite(n) ? n : d[k];
  };
  return {
    minDelaySec: num("minDelaySec"),
    maxDelaySec: num("maxDelaySec"),
    hourlyCap: num("hourlyCap"),
    dailyCap: num("dailyCap"),
    warmupCount: num("warmupCount"),
    warmupMinSec: num("warmupMinSec"),
    warmupMaxSec: num("warmupMaxSec"),
    maxDevicesPerNumber: num("maxDevicesPerNumber"),
  };
}
