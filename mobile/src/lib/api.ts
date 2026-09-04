import * as SecureStore from "expo-secure-store";

// Android emulator reaches the host machine at 10.0.2.2; a physical device on
// the same Wi-Fi needs the machine's LAN IP instead. Override via EXPO_PUBLIC_API_URL.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:4000";

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
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  await setTokens(data.accessToken);
  return data.accessToken as string;
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
  }
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && retry) {
    const newToken = await tryRefresh();
    if (newToken) {
      return api<T>(path, options, false);
    }
    await clearTokens();
    throw new SessionExpiredError();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(typeof body.error === "string" ? body.error : JSON.stringify(body.error));
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
