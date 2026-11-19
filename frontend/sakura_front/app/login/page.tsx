"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { useAuth, User } from "../context/AuthContext";
import { API_URL } from "../../src/lib/api";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

type Mode = "login" | "register";

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const [mode, setMode] = useState<Mode>("login");
  const [invite, setInvite] = useState<string | null>(null);
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [googleReady, setGoogleReady] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Ya logueado -> al dashboard
  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  // ?invite=TOKEN -> validar y abrir en modo registro
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    setInvite(token);
    setMode("register");
    fetch(`${API_URL}/api/invites/${encodeURIComponent(token)}/check`)
      .then(r => r.json())
      .then(d => setInviteValid(!!d.valid))
      .catch(() => setInviteValid(false));
  }, []);

  const finish = useCallback(async (res: Response) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof data.detail === "string" ? data.detail : "No se pudo completar. Revisa los datos.";
      setError(detail);
      return;
    }
    signIn(data.token, data.user as User);
    router.replace("/");
  }, [signIn, router]);

  const handleGoogle = useCallback(async (response: GoogleCredentialResponse) => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential, invite }),
      });
      await finish(res);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo en unos segundos.");
    } finally {
      setSubmitting(false);
    }
  }, [invite, finish]);

  // Renderiza (y re-renderiza al cambiar tema/modo) el botón oficial de Google
  useEffect(() => {
    if (!googleReady || !GOOGLE_CLIENT_ID || !window.google || !googleBtnRef.current) return;
    window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogle });
    googleBtnRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: resolvedTheme === "dark" ? "filled_black" : "outline",
      size: "large",
      shape: "pill",
      text: mode === "register" ? "signup_with" : "continue_with",
      width: 320,
      locale: "es",
    });
  }, [googleReady, handleGoogle, resolvedTheme, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = mode === "login"
        ? await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          })
        : await fetch(`${API_URL}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, name, invite }),
          });
      await finish(res);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo en unos segundos.");
    } finally {
      setSubmitting(false);
    }
  };

  const input = "w-full px-4 py-3 bg-slate-50 dark:bg-[#161616] border border-slate-200 dark:border-[#222] rounded-2xl text-sm font-semibold outline-none focus:border-pink-400 dark:focus:border-[#FFB7C5] transition-colors";
  const label = "text-xs font-bold text-slate-400 uppercase tracking-wider";
  const canRegister = !!invite && inviteValid !== false;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-50 dark:bg-[#0a0a0a]">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setGoogleReady(true)} />

      <div className="w-full max-w-md bg-white dark:bg-[#111] rounded-[2.5rem] border border-slate-200 dark:border-[#222] shadow-2xl p-8 sm:p-10 flex flex-col gap-6">
        <div className="text-center">
          <p className="text-4xl">🌸</p>
          <h1 className="text-2xl font-extrabold tracking-tight mt-2">
            Finanzas<span className="text-pink-500 dark:text-[#FFB7C5]">Sakura</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {mode === "login" ? "Inicia sesión para ver tus finanzas" : "Crea tu cuenta"}
          </p>
        </div>

        {invite && (
          <div className={`text-xs font-semibold rounded-2xl px-4 py-3 text-center ${inviteValid === false ? "bg-red-50 dark:bg-red-500/10 text-red-500" : "bg-pink-50 dark:bg-[#FFB7C5]/10 text-pink-600 dark:text-[#FFB7C5]"}`}>
            {inviteValid === null && "Validando invitación…"}
            {inviteValid === true && "🎉 Te invitaron a FinanzasSakura. Crea tu cuenta para empezar."}
            {inviteValid === false && "Este link de invitación no es válido, ya se usó o venció. Pide uno nuevo."}
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-slate-100 dark:bg-[#161616] rounded-2xl p-1 border border-slate-200 dark:border-[#222]">
          {(["login", "register"] as Mode[]).map(m => (
            <button key={m} type="button" onClick={() => { setMode(m); setError(""); }}
              className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all cursor-pointer ${mode === m ? "bg-white dark:bg-[#222] text-pink-500 dark:text-[#FFB7C5] shadow-sm" : "text-slate-500"}`}>
              {m === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </button>
          ))}
        </div>

        {mode === "register" && !invite ? (
          <p className="text-sm text-center text-slate-500 dark:text-slate-400 py-4">
            Para crear una cuenta necesitas un <span className="font-bold">link de invitación</span>. Pídeselo a quien administra la app.
          </p>
        ) : (
          <>
            {/* Google */}
            <div className="flex flex-col items-center gap-2 min-h-[44px]">
              {GOOGLE_CLIENT_ID ? (
                <div ref={googleBtnRef} className={submitting ? "opacity-50 pointer-events-none" : ""} />
              ) : (
                <p className="text-xs text-slate-400">Inicio con Google no configurado.</p>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs font-bold text-slate-400 uppercase">
              <span className="flex-1 h-px bg-slate-200 dark:bg-[#222]" /> o con email <span className="flex-1 h-px bg-slate-200 dark:bg-[#222]" />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === "register" && (
                <div className="flex flex-col gap-2">
                  <label className={label}>Nombre</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" className={input} autoComplete="name" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className={label}>Email</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" className={input} autoComplete="email" />
              </div>
              <div className="flex flex-col gap-2">
                <label className={label}>Contraseña</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} required minLength={mode === "register" ? 8 : undefined} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={mode === "register" ? "Mínimo 8 caracteres" : "••••••••"} className={`${input} pr-12`}
                    autoComplete={mode === "register" ? "new-password" : "current-password"} />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-pink-500 dark:hover:text-[#FFB7C5] transition-colors cursor-pointer">
                    {showPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 rounded-xl px-3 py-2">{error}</p>
              )}

              <button type="submit" disabled={submitting || (mode === "register" && !canRegister)}
                className="w-full mt-1 bg-gradient-to-r from-pink-500 to-rose-500 dark:from-[#FFB7C5] dark:to-[#ffa0b3] text-white dark:text-black font-extrabold py-3.5 rounded-2xl hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer text-sm">
                {submitting ? "Un momento…" : mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
              </button>
            </form>
          </>
        )}

        <p className="text-[11px] text-center text-slate-400">
          El servidor puede tardar hasta un minuto en despertar si estuvo inactivo.
        </p>
      </div>
    </div>
  );
}
