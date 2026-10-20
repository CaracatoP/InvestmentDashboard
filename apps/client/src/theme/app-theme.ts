export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const storageKey = "invest-hub-theme-preference";

const palettes: Record<ResolvedTheme, Record<string, string>> = {
  dark: {
    canvas: "15 17 21",
    panel: "22 25 31",
    elevated: "30 34 42",
    line: "44 49 59",
    muted: "152 160 174",
    ink: "230 234 240",
    accent: "62 207 142",
    "accent-ink": "6 26 17",
    aqua: "106 168 255",
    violet: "167 145 250",
    amber: "236 178 82",
    rose: "240 122 140",
    teal: "84 204 196"
  },
  light: {
    canvas: "243 245 248",
    panel: "255 255 255",
    elevated: "236 239 244",
    line: "217 222 230",
    muted: "88 97 112",
    ink: "21 25 33",
    accent: "12 138 84",
    "accent-ink": "255 255 255",
    aqua: "37 99 220",
    violet: "112 66 214",
    amber: "176 102 8",
    rose: "200 44 76",
    teal: "13 128 122"
  }
};

const canvasHex: Record<ResolvedTheme, string> = { dark: "#0F1115", light: "#F3F5F8" };

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function normalizeThemePreference(value?: string | null): ThemePreference {
  return value === "light" || value === "system" || value === "dark" ? value : "dark";
}

export function resolveThemePreference(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  return normalizeThemePreference(window.localStorage.getItem(storageKey));
}

export function applyThemePreference(preference: ThemePreference, options: { persist?: boolean } = {}) {
  if (typeof document === "undefined") return;

  const normalizedPreference = normalizeThemePreference(preference);
  const resolvedTheme = resolveThemePreference(normalizedPreference);
  const palette = palettes[resolvedTheme];

  for (const [name, value] of Object.entries(palette)) {
    document.documentElement.style.setProperty(`--color-${name}`, value);
  }

  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = normalizedPreference;
  document.documentElement.style.colorScheme = resolvedTheme;
  document.documentElement.style.setProperty("--shadow-near", resolvedTheme === "dark" ? "0.18" : "0.05");
  document.documentElement.style.setProperty("--shadow-far", resolvedTheme === "dark" ? "0.5" : "0.16");
  document.body.style.background = canvasHex[resolvedTheme];
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", canvasHex[resolvedTheme]);
  window.dispatchEvent(new CustomEvent("invest-hub:theme-change", { detail: resolvedTheme }));

  if (options.persist && typeof window !== "undefined") {
    window.localStorage.setItem(storageKey, normalizedPreference);
  }
}

export function onSystemThemeChange(callback: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;

  const media = window.matchMedia("(prefers-color-scheme: light)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
