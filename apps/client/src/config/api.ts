import { joinApiPath, resolveApiUrl } from "./api-url";

export const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL, import.meta.env.PROD);
export const API_BASE_URL = joinApiPath(API_URL, "/api");

export { joinApiPath };
