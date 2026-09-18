/**
 * Format nomor telepon otomatis untuk seluruh dunia — pengguna tidak perlu
 * memilih kode negara. Nomor yang diawali "+" atau kode negara dikenali
 * langsung; nomor lokal memakai negara bawaan (Indonesia).
 */
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { countryFromNumber } from "@/lib/countries";

export interface FormattedPhone {
  raw: string;
  /** Nomor internasional tanpa tanda plus, siap dikirim ke WhatsApp. */
  e164: string | null;
  country: string | null;
  valid: boolean;
}

export function formatPhoneAuto(input: string, fallbackCountry: CountryCode = "ID"): FormattedPhone {
  const raw = (input ?? "").trim();
  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return { raw, e164: null, country: null, valid: false };

  const attempts: string[] = [];
  if (raw.startsWith("+")) attempts.push(raw);
  if (digitsOnly.startsWith("00")) attempts.push(`+${digitsOnly.slice(2)}`);
  // Nomor lokal Indonesia sering diawali 0.
  if (!raw.startsWith("+") && !digitsOnly.startsWith("00")) {
    if (countryFromNumber(digitsOnly) && !digitsOnly.startsWith("0")) {
      attempts.push(`+${digitsOnly}`);
    }
    attempts.push(digitsOnly);
  }

  for (const candidate of attempts) {
    const parsed = candidate.startsWith("+")
      ? parsePhoneNumberFromString(candidate)
      : parsePhoneNumberFromString(candidate, fallbackCountry);
    if (parsed?.isValid()) {
      return {
        raw,
        e164: parsed.number.replace("+", ""),
        country: parsed.country ?? null,
        valid: true,
      };
    }
  }

  return { raw, e164: null, country: null, valid: false };
}

/** Pisahkan daftar nomor (baris, koma, titik koma, spasi) lalu format semuanya. */
export function parsePhoneList(
  text: string,
  fallbackCountry: CountryCode = "ID",
): { valid: FormattedPhone[]; invalid: string[] } {
  const parts = (text ?? "")
    .split(/[\n,;\t]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const valid: FormattedPhone[] = [];
  const invalid: string[] = [];

  for (const part of parts) {
    const result = formatPhoneAuto(part, fallbackCountry);
    if (result.valid && result.e164) {
      if (seen.has(result.e164)) continue;
      seen.add(result.e164);
      valid.push(result);
    } else {
      invalid.push(part);
    }
  }

  return { valid, invalid };
}
