// Cliente del backend: agrega el token de sesión y maneja la sesión vencida.

export const API_URL = process.env.NEXT_PUBLIC_API_URL;
const TOKEN_KEY = "sakura_token";
const USER_KEY = "sakura_user"; // copia del usuario para mostrar la app sin esperar a /api/auth/me

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    // Navegación privada / storage bloqueado: la sesión dura lo que la pestaña
  }
}

export function getCachedUser<T>(): T | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setCachedUser(user: unknown) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // storage lleno o bloqueado: solo se pierde el arranque instantáneo
  }
}

/** fetch al backend con Authorization. Si la sesión venció, limpia el token y manda a /login. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (!token) {
    // Sin sesión no tiene sentido llamar: evita requests (y redirecciones) innecesarias
    return new Response(JSON.stringify({ detail: "Sin sesión" }), { status: 401 });
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    setToken(null);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
  return res;
}
