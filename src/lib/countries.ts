/** Complete international dialling-code list used by the global phone input. */

import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";

export interface Country {
  iso: string;
  name: string;
  dial: string;
  flag: string;
}

const regionNames = new Intl.DisplayNames(["id"], { type: "region" });

function countryFlag(iso: string): string {
  return [...iso.toUpperCase()]
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

export const COUNTRIES: Country[] = getCountries()
  .map((iso: CountryCode) => ({
    iso,
    name: regionNames.of(iso) ?? iso,
    dial: getCountryCallingCode(iso),
    flag: countryFlag(iso),
  }))
  .sort((a, b) => {
    if (a.iso === "ID") return -1;
    if (b.iso === "ID") return 1;
    return a.name.localeCompare(b.name, "id");
  });

export const DEFAULT_COUNTRY_ISO = "ID";

export function countryByIso(iso: string): Country {
  const selected = COUNTRIES.find((c) => c.iso === iso);
  if (selected) return selected;
  const indonesia = COUNTRIES.find((c) => c.iso === DEFAULT_COUNTRY_ISO);
  if (indonesia) return indonesia;
  return { iso: "ID", name: "Indonesia", dial: "62", flag: "🇮🇩" };
}

/** Longest-prefix match of an international number against known dial codes. */
export function countryFromNumber(digits: string): Country | null {
  const clean = (digits ?? "").replace(/\D/g, "");
  let best: Country | null = null;
  for (const c of COUNTRIES) {
    if (clean.startsWith(c.dial) && (!best || c.dial.length > best.dial.length)) best = c;
  }
  return best;
}
