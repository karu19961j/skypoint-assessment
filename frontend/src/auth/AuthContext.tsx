import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, getToken, setToken, setUnauthorizedHandler } from "@/api/client";
import { authApi } from "@/api/endpoints";
import type { TokenResponse, User } from "@/api/types";
import { AuthContext, type AuthContextValue } from "./context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
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
    // Wipe the React Query cache so a different user signing in on the
    // same tab doesn't see the previous account's data flash through
    // before fresh fetches complete.
    queryClient.clear();
  }, [queryClient]);

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

  // Cross-tab sync — log out / log in in tab A should propagate to tab B
  // without a page refresh. The `storage` event fires only in OTHER tabs
  // (not the originating one), so we react by re-reading the token and
  // syncing the user state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = async (e: StorageEvent) => {
      // jobportal.token is the key used by api/client.ts setToken().
      if (e.key !== "jobportal.token") return;
      const token = getToken();
      if (!token) {
        // Logout happened in the other tab.
        setUser(null);
        return;
      }
      // Login (or token refresh) happened elsewhere — re-fetch /me.
      try {
        const me = await authApi.me();
        setUser(me);
      } catch {
        setUser(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
