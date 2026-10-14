import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { api, ApiError, clearTokens, getAccessToken, SessionExpiredError, setTokens } from "../lib/api";
import { isBackgroundLocationRunning, stopBackgroundLocationUpdates } from "../lib/locationTask";
import type { User } from "../lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// The last profile the server returned, so a phone with a valid login but no
// signal at the moment the app opens stays logged in instead of bouncing to
// the login screen.
const USER_KEY = "pt_user";

async function cachedUser(): Promise<User | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  try {
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

const rememberUser = (user: User) => SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api<{ user: User }>("/api/auth/me");
      setUser(data.user);
      await rememberUser(data.user);
    } catch (err) {
      const rejected =
        err instanceof SessionExpiredError || (err instanceof ApiError && (err.status === 401 || err.status === 403));
      if (rejected) {
        await SecureStore.deleteItemAsync(USER_KEY);
        setUser(null);
      } else {
        // Network trouble, not a bad login: carry on with what we knew.
        setUser(await cachedUser());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = useCallback(async (phone: string, password: string) => {
    const data = await api<{ accessToken: string; refreshToken: string; user: User }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ phone, password }) }
    );
    await setTokens(data.accessToken, data.refreshToken);
    await rememberUser(data.user);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    if (await isBackgroundLocationRunning()) {
      await stopBackgroundLocationUpdates();
      await api("/api/tracking/duty", { method: "POST", body: JSON.stringify({ onDuty: false }) }).catch(
        () => {}
      );
    }
    await clearTokens();
    await SecureStore.deleteItemAsync(USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
