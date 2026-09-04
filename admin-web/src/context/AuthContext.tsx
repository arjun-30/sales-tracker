import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearTokens, getAccessToken, setTokens } from "../lib/api";
import { connectSocket, disconnectSocket } from "../lib/socket";
import type { AuthUser } from "../lib/types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    try {
      const data = await api<{ user: AuthUser }>("/api/auth/me");
      setUser(data.user);
      if (data.user.role === "admin") connectSocket();
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = useCallback(async (phone: string, password: string) => {
    const data = await api<{ accessToken: string; refreshToken: string; user: AuthUser }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ phone, password }) }
    );
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    if (data.user.role === "admin") connectSocket();
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    disconnectSocket();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
