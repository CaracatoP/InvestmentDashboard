export function normalizeApiUrl(rawUrl: string) {
  const normalized = rawUrl.trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("VITE_API_URL cannot be empty");
  }

  return normalized;
}

export function resolveApiUrl(rawApiUrl: string | undefined, isProduction: boolean) {
  if (isProduction && !rawApiUrl) {
    throw new Error("VITE_API_URL is required in production");
  }

  return normalizeApiUrl(rawApiUrl || "http://localhost:4000");
}

export function joinApiPath(baseUrl: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeApiUrl(baseUrl)}${normalizedPath}`;
}
