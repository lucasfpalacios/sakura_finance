"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_URL, apiFetch, getCachedUser, getToken, setCachedUser, setToken } from "../../src/lib/api";
import { PageSkeleton } from "../../src/components/Skeleton";

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  role: "owner" | "user";
  has_password: boolean;
  has_google: boolean;
}

interface AuthContextProps {
  user: User | null;
  loading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

// Rutas accesibles sin sesión
const PUBLIC_PATHS = ["/login"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    // Con un usuario guardado, la app se muestra al instante y la sesión se valida en segundo plano.
    // Si el token venció, apiFetch limpia la sesión y manda a /login.
    const cached = getCachedUser<User>();
    if (cached) {
      setUser(cached);
      setLoading(false);
    }
    apiFetch(`${API_URL}/api/auth/me`)
      .then(async res => {
        if (!res.ok) return;
        const fresh: User = await res.json();
        setUser(fresh);
        setCachedUser(fresh);
      })
      .catch(err => console.error("Error al validar la sesión:", err))
      .finally(() => setLoading(false));
  }, []);

  const isPublic = PUBLIC_PATHS.some(p => pathname?.startsWith(p));

  // Sin sesión en una ruta privada -> login
  useEffect(() => {
    if (!loading && !user && !isPublic) router.replace("/login");
  }, [loading, user, isPublic, router]);

  const signIn = useCallback((token: string, u: User) => {
    setToken(token);
    setUser(u);
    setCachedUser(u);
  }, []);

  const updateUser = useCallback((u: User) => {
    setUser(u);
    setCachedUser(u);
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    try { window.google?.accounts.id.disableAutoSelect(); } catch { /* script no cargado */ }
    router.replace("/login");
  }, [router]);

  // Mientras valida la sesión, o si va a redirigir, no renderiza páginas privadas
  const blocked = !isPublic && (loading || !user);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, updateUser }}>
      {blocked ? <PageSkeleton /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
