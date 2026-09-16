/** Country dialling codes used by the global phone input. */

export interface Country {
  iso: string;
  name: string;
  dial: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { iso: "ID", name: "Indonesia", dial: "62", flag: "🇮🇩" },
  { iso: "MY", name: "Malaysia", dial: "60", flag: "🇲🇾" },
  { iso: "SG", name: "Singapura", dial: "65", flag: "🇸🇬" },
  { iso: "TH", name: "Thailand", dial: "66", flag: "🇹🇭" },
  { iso: "PH", name: "Filipina", dial: "63", flag: "🇵🇭" },
  { iso: "VN", name: "Vietnam", dial: "84", flag: "🇻🇳" },
  { iso: "BN", name: "Brunei", dial: "673", flag: "🇧🇳" },
  { iso: "KH", name: "Kamboja", dial: "855", flag: "🇰🇭" },
  { iso: "LA", name: "Laos", dial: "856", flag: "🇱🇦" },
  { iso: "MM", name: "Myanmar", dial: "95", flag: "🇲🇲" },
  { iso: "TL", name: "Timor Leste", dial: "670", flag: "🇹🇱" },
  { iso: "AU", name: "Australia", dial: "61", flag: "🇦🇺" },
  { iso: "NZ", name: "Selandia Baru", dial: "64", flag: "🇳🇿" },
  { iso: "CN", name: "Tiongkok", dial: "86", flag: "🇨🇳" },
  { iso: "HK", name: "Hong Kong", dial: "852", flag: "🇭🇰" },
  { iso: "TW", name: "Taiwan", dial: "886", flag: "🇹🇼" },
  { iso: "JP", name: "Jepang", dial: "81", flag: "🇯🇵" },
  { iso: "KR", name: "Korea Selatan", dial: "82", flag: "🇰🇷" },
  { iso: "IN", name: "India", dial: "91", flag: "🇮🇳" },
  { iso: "PK", name: "Pakistan", dial: "92", flag: "🇵🇰" },
  { iso: "BD", name: "Bangladesh", dial: "880", flag: "🇧🇩" },
  { iso: "LK", name: "Sri Lanka", dial: "94", flag: "🇱🇰" },
  { iso: "NP", name: "Nepal", dial: "977", flag: "🇳🇵" },
  { iso: "AE", name: "Uni Emirat Arab", dial: "971", flag: "🇦🇪" },
  { iso: "SA", name: "Arab Saudi", dial: "966", flag: "🇸🇦" },
  { iso: "QA", name: "Qatar", dial: "974", flag: "🇶🇦" },
  { iso: "KW", name: "Kuwait", dial: "965", flag: "🇰🇼" },
  { iso: "BH", name: "Bahrain", dial: "973", flag: "🇧🇭" },
  { iso: "OM", name: "Oman", dial: "968", flag: "🇴🇲" },
  { iso: "IL", name: "Israel", dial: "972", flag: "🇮🇱" },
  { iso: "TR", name: "Turki", dial: "90", flag: "🇹🇷" },
  { iso: "EG", name: "Mesir", dial: "20", flag: "🇪🇬" },
  { iso: "MA", name: "Maroko", dial: "212", flag: "🇲🇦" },
  { iso: "NG", name: "Nigeria", dial: "234", flag: "🇳🇬" },
  { iso: "KE", name: "Kenya", dial: "254", flag: "🇰🇪" },
  { iso: "ZA", name: "Afrika Selatan", dial: "27", flag: "🇿🇦" },
  { iso: "GB", name: "Inggris", dial: "44", flag: "🇬🇧" },
  { iso: "IE", name: "Irlandia", dial: "353", flag: "🇮🇪" },
  { iso: "FR", name: "Prancis", dial: "33", flag: "🇫🇷" },
  { iso: "DE", name: "Jerman", dial: "49", flag: "🇩🇪" },
  { iso: "NL", name: "Belanda", dial: "31", flag: "🇳🇱" },
  { iso: "BE", name: "Belgia", dial: "32", flag: "🇧🇪" },
  { iso: "ES", name: "Spanyol", dial: "34", flag: "🇪🇸" },
  { iso: "PT", name: "Portugal", dial: "351", flag: "🇵🇹" },
  { iso: "IT", name: "Italia", dial: "39", flag: "🇮🇹" },
  { iso: "CH", name: "Swiss", dial: "41", flag: "🇨🇭" },
  { iso: "AT", name: "Austria", dial: "43", flag: "🇦🇹" },
  { iso: "SE", name: "Swedia", dial: "46", flag: "🇸🇪" },
  { iso: "NO", name: "Norwegia", dial: "47", flag: "🇳🇴" },
  { iso: "DK", name: "Denmark", dial: "45", flag: "🇩🇰" },
  { iso: "FI", name: "Finlandia", dial: "358", flag: "🇫🇮" },
  { iso: "PL", name: "Polandia", dial: "48", flag: "🇵🇱" },
  { iso: "CZ", name: "Ceko", dial: "420", flag: "🇨🇿" },
  { iso: "GR", name: "Yunani", dial: "30", flag: "🇬🇷" },
  { iso: "RO", name: "Rumania", dial: "40", flag: "🇷🇴" },
  { iso: "RU", name: "Rusia", dial: "7", flag: "🇷🇺" },
  { iso: "UA", name: "Ukraina", dial: "380", flag: "🇺🇦" },
  { iso: "US", name: "Amerika Serikat", dial: "1", flag: "🇺🇸" },
  { iso: "CA", name: "Kanada", dial: "1", flag: "🇨🇦" },
  { iso: "MX", name: "Meksiko", dial: "52", flag: "🇲🇽" },
  { iso: "BR", name: "Brasil", dial: "55", flag: "🇧🇷" },
  { iso: "AR", name: "Argentina", dial: "54", flag: "🇦🇷" },
  { iso: "CL", name: "Chili", dial: "56", flag: "🇨🇱" },
  { iso: "CO", name: "Kolombia", dial: "57", flag: "🇨🇴" },
  { iso: "PE", name: "Peru", dial: "51", flag: "🇵🇪" },
];

export const DEFAULT_COUNTRY_ISO = "ID";

export function countryByIso(iso: string): Country {
  return COUNTRIES.find((c) => c.iso === iso) ?? COUNTRIES[0]!;
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
