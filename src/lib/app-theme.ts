export const APP_THEMES = [
  { id: "dark-emerald", name: "Dark Emerald", category: "Gelap" },
  { id: "midnight-indigo", name: "Midnight Indigo", category: "Gelap" },
  { id: "semi-dark-teal", name: "Semi Dark Teal", category: "Semi Gelap" },
  { id: "semi-dark-amber", name: "Semi Dark Amber", category: "Semi Gelap" },
  { id: "light-mint-fresh", name: "Light Mint Fresh", category: "Terang" },
  { id: "warm-cream-peach", name: "Warm Cream Peach", category: "Terang" },
  { id: "pastel-lavender", name: "Pastel Lavender", category: "Terang" },
] as const;

export type AppThemeId = (typeof APP_THEMES)[number]["id"];

export const DEFAULT_APP_THEME: AppThemeId = "dark-emerald";

export function isAppThemeId(value: unknown): value is AppThemeId {
  return APP_THEMES.some((theme) => theme.id === value);
}

export function applyAppTheme(theme: AppThemeId) {
  document.documentElement.setAttribute("data-app-theme", theme);
}