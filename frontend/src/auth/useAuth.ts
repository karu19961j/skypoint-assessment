import { useContext } from "react";

import { AuthContext, type AuthContextValue } from "./context";

/**
 * Access the auth state. Throws if mounted outside `<AuthProvider>` —
 * that's a programming error, not a runtime branch a consumer should
 * have to handle.
 *
 * Split out of `AuthContext.tsx` so the file containing the provider
 * component exports only components (keeps react-refresh happy).
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
