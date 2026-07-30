export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const storageKey = "invest-hub-theme-preference";

const palettes: Record<ResolvedTheme, Record<string, string>> = {
  dark: {
    canvas: "7 8 9",
    panel: "13 15 16",
    elevated: "20 22 23",
    line: "35 39 40",
    muted: "139 148 145",
    ink: "244 247 245",
    accent: "34 197 94",
    aqua: "56 189 248",
    violet: "167 139 250",
    amber: "245 158 11",
    rose: "251 113 133"
  },
  light: {
    canvas: "247 250 248",
    panel: "255 255 255",
    elevated: "239 246 242",
    line: "208 219 214",
    muted: "89 106 98",
    ink: "9 22 15",
    accent: "22 163 74",
    aqua: "2 132 199",
    violet: "124 58 237",
    amber: "217 119 6",
    rose: "225 29 72"
  }
};

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
  document.body.style.background =
    resolvedTheme === "dark"
      ? "radial-gradient(circle at top left, rgba(34, 197, 94, 0.08), transparent 28rem), linear-gradient(180deg, #070809 0%, #0a0b0c 100%)"
      : "radial-gradient(circle at top left, rgba(34, 163, 74, 0.12), transparent 28rem), linear-gradient(180deg, #f7faf8 0%, #eef5f1 100%)";

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
