import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from "react";

export interface AuthUser {
  _id: string;
  email: string;
  name: string;
  role: "talent" | "business";
  avatarUrl?: string | null;
  walletAddress?: string | null;
  isOnline?: boolean;
  createdAt?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("dehix_token"));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("dehix_user");
    if (!raw) return null;
    try { return JSON.parse(raw) as AuthUser; } catch { return null; }
  });

  const clearAuth = useCallback(() => {
    localStorage.removeItem("dehix_token");
    localStorage.removeItem("dehix_user");
    setToken(null);
    setUser(null);
  }, []);

  const login = (newToken: string, newUser: AuthUser) => {
    localStorage.setItem("dehix_token", newToken);
    localStorage.setItem("dehix_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    clearAuth();
  };

  useEffect(() => {
    window.addEventListener("dehix:auth-cleared", clearAuth);
    return () => window.removeEventListener("dehix:auth-cleared", clearAuth);
  }, [clearAuth]);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 401) {
          clearAuth();
          return;
        }
        if (res.ok) {
          const freshUser = await res.json();
          localStorage.setItem("dehix_user", JSON.stringify(freshUser));
          setUser(freshUser);
        }
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          console.warn("Failed to validate saved auth token", err);
        }
      });

    return () => controller.abort();
  }, [token, clearAuth]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token && !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
