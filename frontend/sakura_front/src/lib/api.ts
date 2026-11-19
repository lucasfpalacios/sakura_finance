// Cliente del backend: agrega el token de sesión y maneja la sesión vencida.

export const API_URL = process.env.NEXT_PUBLIC_API_URL;
const TOKEN_KEY = "sakura_token";

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
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Navegación privada / storage bloqueado: la sesión dura lo que la pestaña
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
