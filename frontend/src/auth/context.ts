import { createContext } from "react";

import type { User } from "@/api/types";

/**
 * Shared shape + context handle for the auth surface.
 *
 * Lives in its own module so:
 *   - `AuthContext.tsx` can export only the `<AuthProvider>` component
 *     (react-refresh's fast-HMR rule wants components-only files).
 *   - `useAuth.ts` can import the context without pulling in the
 *     provider's render tree.
 */
export interface AuthContextValue {
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

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
