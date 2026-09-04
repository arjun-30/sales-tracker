import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, clearTokens, getAccessToken, setTokens } from "../lib/api";
import { isBackgroundLocationRunning, stopBackgroundLocationUpdates } from "../lib/locationTask";
import type { User } from "../lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
    } catch {
      setUser(null);
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
