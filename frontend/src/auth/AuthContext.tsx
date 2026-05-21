import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, getToken, setToken, setUnauthorizedHandler } from "@/api/client";
import { authApi } from "@/api/endpoints";
import type { TokenResponse, User } from "@/api/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: {
    email: string;
    password: string;
    full_name: string;
    role: "hr" | "candidate";
  }) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const token = getToken();
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await authApi.me();
        if (!cancelled) setUser(me);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const accept = useCallback((resp: TokenResponse) => {
    setToken(resp.access_token);
    setUser(resp.user);
    return resp.user;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => accept(await authApi.login(email, password)),
    [accept],
  );

  const register = useCallback(
    async (input: Parameters<AuthContextValue["register"]>[0]) =>
      accept(await authApi.register(input)),
    [accept],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // When any authenticated request returns 401 (token expired / revoked),
  // surface that as a clean logout + redirect to /login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
