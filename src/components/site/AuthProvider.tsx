"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

export type Me = { isAuthenticated: boolean; user?: { name: string; email: string; picture: string } };
const AuthCtx = createContext<Me | null>(null);

/** One /auth/me lookup shared by the header menu and the sign-in prompt. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    api<Me>("/auth/me")
      .then((d) => alive && setMe(d))
      .catch(() => alive && setMe({ isAuthenticated: false }));
    return () => {
      alive = false;
    };
  }, []);

  return <AuthCtx.Provider value={me}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
