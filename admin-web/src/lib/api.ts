export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const ACCESS_KEY = "pt_access_token";
const REFRESH_KEY = "pt_refresh_token";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  setTokens(data.accessToken);
  return data.accessToken as string;
}

// The plant the super admin is looking at ("" = every plant), sent as
// ?plantId with every request. The server ignores it for plant admins, who
// only ever see their own plant.
let scopePlantId = "";

export function setScopePlantId(plantId: string) {
  scopePlantId = plantId;
}

function withPlantScope(path: string): string {
  if (!scopePlantId || !path.startsWith("/api/") || path.startsWith("/api/auth/")) return path;
  return `${path}${path.includes("?") ? "&" : "?"}plantId=${encodeURIComponent(scopePlantId)}`;
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}${withPlantScope(path)}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // A 401 from /api/auth/* means bad credentials, not an expired session.
  if (res.status === 401 && retry && !path.startsWith("/api/auth/")) {
    const newToken = await tryRefresh();
    if (newToken) {
      return api<T>(path, options, false);
    }
    clearTokens();
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(typeof body.error === "string" ? body.error : JSON.stringify(body.error));
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// A file the API serves behind login (an order's voice note), as a Blob.
export async function apiBlob(path: string, retry = true): Promise<Blob> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status === 401 && retry && (await tryRefresh())) return apiBlob(path, false);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(typeof body.error === "string" ? body.error : res.statusText);
  }
  return res.blob();
}
