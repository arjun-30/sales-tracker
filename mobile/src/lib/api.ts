import * as SecureStore from "expo-secure-store";

// Android emulator reaches the host machine at 10.0.2.2; a physical device on
// the same Wi-Fi needs the machine's LAN IP instead. Override via EXPO_PUBLIC_API_URL.
export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:4000";

// A test server's address changes with the network it is on, so the login
// screen lets you point the app elsewhere without a rebuild. Saved on the phone.
const SERVER_KEY = "pt_server_url";
let cachedApiUrl: string | null = null;

export async function getApiUrl(): Promise<string> {
  const url = cachedApiUrl ?? ((await SecureStore.getItemAsync(SERVER_KEY)) || DEFAULT_API_URL);
  cachedApiUrl = url;
  return url;
}

// "192.168.1.5" → "http://192.168.1.5:4010"; full URLs are kept as typed.
export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  if (/^http:\/\/[\d.]+$/.test(url)) url = `${url}:4010`;
  return url;
}

export async function setApiUrl(input: string | null) {
  if (!input || !input.trim()) {
    await SecureStore.deleteItemAsync(SERVER_KEY);
  } else {
    await SecureStore.setItemAsync(SERVER_KEY, normalizeServerUrl(input));
  }
  cachedApiUrl = null;
}

// True when something answering like our API is at `url` (any HTTP reply counts;
// an unauthenticated request is expected to get 401).
export async function canReachServer(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${url}/api/districts`, { signal: controller.signal });
    return res.status === 401 || res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const ACCESS_KEY = "pt_access_token";
const REFRESH_KEY = "pt_refresh_token";

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function setTokens(accessToken: string, refreshToken?: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  if (refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

async function tryRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  const res = await fetch(`${await getApiUrl()}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  await setTokens(data.accessToken);
  return data.accessToken as string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
  }
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${await getApiUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // A 401 from login or refresh means bad credentials, not an expired session.
  // Every other call, /api/auth/me included, renews an expired access token:
  // without that, opening the app 15+ minutes after the last request logged
  // the employee out.
  const isCredentialCall = path.startsWith("/api/auth/login") || path.startsWith("/api/auth/refresh");
  if (res.status === 401 && retry && !isCredentialCall) {
    const newToken = await tryRefresh();
    if (newToken) {
      return api<T>(path, options, false);
    }
    await clearTokens();
    throw new SessionExpiredError();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(typeof body.error === "string" ? body.error : JSON.stringify(body.error), res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
