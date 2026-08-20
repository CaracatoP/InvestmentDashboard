export function normalizeApiUrl(rawUrl: string) {
  const normalized = rawUrl.trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("VITE_API_URL cannot be empty");
  }

  return normalized;
}

function resolveBrowserOrigin() {
  if (typeof globalThis === "undefined" || !("location" in globalThis)) return "";
  const origin = globalThis.location?.origin;
  return typeof origin === "string" && origin.trim() ? normalizeApiUrl(origin) : "";
}

function isCrossOrigin(configuredUrl: string, browserOrigin: string) {
  try {
    return new URL(configuredUrl).origin !== new URL(browserOrigin).origin;
  } catch {
    return false;
  }
}

export function resolveApiUrl(rawApiUrl: string | undefined, isProduction: boolean, browserOrigin = resolveBrowserOrigin()) {
  if (!isProduction) {
    return normalizeApiUrl(rawApiUrl || "http://localhost:4000");
  }

  const normalizedBrowserOrigin = browserOrigin.trim() ? normalizeApiUrl(browserOrigin) : "";
  const configuredUrl = rawApiUrl?.trim() ? normalizeApiUrl(rawApiUrl) : "";

  if (!configuredUrl) {
    return normalizedBrowserOrigin;
  }

  if (normalizedBrowserOrigin && isCrossOrigin(configuredUrl, normalizedBrowserOrigin)) {
    return normalizedBrowserOrigin;
  }

  return configuredUrl;
}

export function joinApiPath(baseUrl: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!baseUrl.trim()) return normalizedPath;
  return `${normalizeApiUrl(baseUrl)}${normalizedPath}`;
}
