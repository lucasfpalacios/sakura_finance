"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FiCopy, FiCheck, FiLogOut, FiLink, FiX, FiEdit2, FiCamera } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { API_URL, apiFetch } from "../../src/lib/api";

interface Invite {
  token: string;
  status: "pending" | "used" | "expired" | "revoked";
  created_at: string;
  expires_at: string;
  used_by: string | null;
}

const STATUS: Record<Invite["status"], { text: string; cls: string }> = {
  pending: { text: "Pendiente", cls: "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  used: { text: "Usada", cls: "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  expired: { text: "Vencida", cls: "bg-slate-100 dark:bg-[#222] text-slate-500" },
  revoked: { text: "Revocada", cls: "bg-slate-100 dark:bg-[#222] text-slate-500" },
};

// Recorta al centro en cuadrado y achica a 256px: la foto pesa ~20-40 KB y se guarda en la base
function resizeImage(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagen")); };
    img.src = url;
  });
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });

export default function PerfilPage() {
  const { user, signOut, updateUser } = useAuth();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState("");
  const isOwner = user?.role === "owner";

  const inviteLink = (token: string) => `${window.location.origin}/login?invite=${token}`;

  const loadInvites = useCallback(async () => {
    const res = await apiFetch(`${API_URL}/api/invites`);
    if (res.ok) setInvites(await res.json());
  }, []);

  useEffect(() => {
    if (isOwner) loadInvites();
  }, [isOwner, loadInvites]);

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setCopied(token);
      setTimeout(() => setCopied(c => (c === token ? null : c)), 2000);
    } catch {
      setError("No se pudo copiar. Copia el link manualmente.");
    }
  };

  const createInvite = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await apiFetch(`${API_URL}/api/invites`, { method: "POST" });
      if (!res.ok) throw new Error();
      const inv: Invite = await res.json();
      setInvites(list => [inv, ...list]);
      copy(inv.token);
    } catch {
      setError("No se pudo generar la invitación.");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (token: string) => {
    if (!confirm("¿Revocar esta invitación? El link dejará de funcionar.")) return;
    const res = await apiFetch(`${API_URL}/api/invites/${token}`, { method: "DELETE" });
    if (res.ok) loadInvites();
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    setSavingPw(true);
    try {
      const res = await apiFetch(`${API_URL}/api/auth/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: newPw, current_password: currentPw || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwMsg({ ok: false, text: typeof data.detail === "string" ? data.detail : "No se pudo guardar la contraseña." });
        return;
      }
      updateUser(data.user);
      setCurrentPw("");
      setNewPw("");
      setPwMsg({ ok: true, text: "Contraseña guardada. Ya puedes entrar también con tu email." });
    } finally {
      setSavingPw(false);
    }
  };

  const saveProfile = async (changes: { name?: string; picture?: string | null }) => {
    setProfileMsg("");
    setSavingProfile(true);
    try {
      const res = await apiFetch(`${API_URL}/api/auth/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileMsg(typeof data.detail === "string" ? data.detail : "No se pudo guardar.");
        return false;
      }
      updateUser(data);
      return true;
    } finally {
      setSavingProfile(false);
    }
  };

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileMsg("Elige un archivo de imagen.");
      return;
    }
    try {
      await saveProfile({ picture: await resizeImage(file) });
    } catch {
      setProfileMsg("No se pudo leer la imagen. Prueba con otra (JPG o PNG).");
    }
  };

  const startEditName = () => {
    setNameInput(user?.name ?? "");
    setEditingName(true);
  };

  const saveName = async () => {
    if (!nameInput.trim()) return;
    if (await saveProfile({ name: nameInput })) setEditingName(false);
  };

  if (!user) return null;

  const card = "bg-white dark:bg-[#111] rounded-3xl border border-slate-200 dark:border-[#222] shadow-[0_4px_20px_rgba(0,0,0,0.02)] p-6";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] py-8 px-4 sm:px-8">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <header className="border-b border-slate-200 dark:border-[#222] pb-6">
          <span className="text-pink-500 dark:text-[#FFB7C5] font-semibold text-sm tracking-wide uppercase">Mi cuenta</span>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mt-1 tracking-tight">Perfil</h1>
        </header>

        {/* Datos del usuario */}
        <div className={`${card} flex flex-col sm:flex-row sm:items-center gap-5`}>
          {/* Foto: click para cambiar */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={savingProfile}
              title="Cambiar foto" className="relative group w-20 h-20 rounded-full cursor-pointer disabled:opacity-60">
              {user.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-20 h-20 rounded-full object-cover" />
              ) : (
                <span className="w-20 h-20 rounded-full bg-pink-100 dark:bg-[#FFB7C5]/10 text-pink-500 dark:text-[#FFB7C5] flex items-center justify-center text-3xl font-extrabold">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="absolute inset-0 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <FiCamera className="text-xl" />
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
            {user.picture && (
              <button type="button" onClick={() => saveProfile({ picture: null })} disabled={savingProfile}
                className="text-[11px] font-bold text-slate-400 hover:text-red-500 transition-colors cursor-pointer">
                Quitar foto
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex gap-2 items-center">
                <input autoFocus value={nameInput} maxLength={60} onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                  className="flex-1 min-w-0 px-3 py-2 bg-slate-50 dark:bg-[#161616] border border-slate-200 dark:border-[#222] rounded-xl text-base font-bold outline-none focus:border-pink-400 dark:focus:border-[#FFB7C5]" />
                <button onClick={saveName} disabled={savingProfile || !nameInput.trim()} title="Guardar"
                  className="p-2.5 rounded-xl bg-emerald-500 text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"><FiCheck /></button>
                <button onClick={() => setEditingName(false)} title="Cancelar"
                  className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#222] text-slate-500 cursor-pointer"><FiX /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-xl font-extrabold text-slate-900 dark:text-white truncate">{user.name}</p>
                <button onClick={startEditName} title="Editar nombre"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-pink-500 dark:hover:text-[#FFB7C5] transition-colors cursor-pointer shrink-0">
                  <FiEdit2 size={14} />
                </button>
              </div>
            )}
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {isOwner && <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-pink-100 dark:bg-[#FFB7C5]/10 text-pink-600 dark:text-[#FFB7C5]">Administrador</span>}
              {user.has_google && <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-slate-100 dark:bg-[#222] text-slate-500">Google</span>}
              {user.has_password && <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-slate-100 dark:bg-[#222] text-slate-500">Email y contraseña</span>}
            </div>
            {profileMsg && <p className="text-xs font-semibold text-red-500 mt-2">{profileMsg}</p>}
          </div>
          <button onClick={signOut}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-[#222] text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-red-500 hover:border-red-200 dark:hover:border-red-500/30 transition-all cursor-pointer">
            <FiLogOut /> Cerrar sesión
          </button>
        </div>

        {/* Contraseña: misma cuenta para Google y email */}
        <form onSubmit={savePassword} className={`${card} flex flex-col gap-4`}>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">🔑 {user.has_password ? "Cambiar contraseña" : "Agregar contraseña"}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Tu cuenta es tu email: entres con Google o con email y contraseña, ves los mismos datos.
              {!user.has_password && " Agrega una contraseña para poder entrar también sin Google."}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {user.has_password && (
              <input type="password" required value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                placeholder="Contraseña actual" autoComplete="current-password"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-[#161616] border border-slate-200 dark:border-[#222] rounded-2xl text-sm font-semibold outline-none focus:border-pink-400 dark:focus:border-[#FFB7C5]" />
            )}
            <input type="password" required minLength={8} value={newPw} onChange={e => setNewPw(e.target.value)}
              placeholder="Nueva contraseña (mín. 8)" autoComplete="new-password"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-[#161616] border border-slate-200 dark:border-[#222] rounded-2xl text-sm font-semibold outline-none focus:border-pink-400 dark:focus:border-[#FFB7C5]" />
          </div>
          {pwMsg && (
            <p className={`text-xs font-semibold rounded-xl px-3 py-2 ${pwMsg.ok ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10" : "text-red-500 bg-red-50 dark:bg-red-500/10"}`}>{pwMsg.text}</p>
          )}
          <button type="submit" disabled={savingPw}
            className="self-start px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-[#222] text-sm font-bold text-slate-700 dark:text-slate-200 hover:border-pink-300 dark:hover:border-[#FFB7C5]/50 disabled:opacity-50 transition-all cursor-pointer">
            {savingPw ? "Guardando…" : "Guardar contraseña"}
          </button>
        </form>

        {/* Invitaciones (solo administrador) */}
        {isOwner && (
          <div className={`${card} flex flex-col gap-4`}>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">✉️ Invitaciones</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Genera un link y compártelo. Sirve para crear una sola cuenta y vence en 7 días. Cada persona tiene sus propios datos.
                </p>
              </div>
              <button onClick={createInvite} disabled={creating}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 dark:from-[#FFB7C5] dark:to-[#ffa0b3] text-white dark:text-black text-sm font-extrabold hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer shrink-0">
                <FiLink /> {creating ? "Generando…" : "Generar link"}
              </button>
            </div>

            {error && <p className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 rounded-xl px-3 py-2">{error}</p>}

            {invites.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-6">Todavía no generaste invitaciones.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {invites.map(inv => (
                  <div key={inv.token} className="p-4 rounded-2xl bg-slate-50 dark:bg-[#161616] border border-slate-100 dark:border-[#222]/50 flex flex-col gap-2">
                    <div className="flex justify-between items-center gap-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${STATUS[inv.status].cls}`}>{STATUS[inv.status].text}</span>
                      <span className="text-[11px] text-slate-400">
                        {inv.status === "used" ? `Usada por ${inv.used_by}` : `Creada ${formatDate(inv.created_at)} · vence ${formatDate(inv.expires_at)}`}
                      </span>
                    </div>
                    {inv.status === "pending" && (
                      <div className="flex gap-2 items-center">
                        <input readOnly value={inviteLink(inv.token)} onFocus={e => e.target.select()}
                          className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-[#111] border border-slate-200 dark:border-[#222] rounded-xl text-xs font-mono text-slate-600 dark:text-slate-300 outline-none" />
                        <button onClick={() => copy(inv.token)} title="Copiar link"
                          className="p-2 rounded-xl text-slate-500 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-500/10 dark:hover:text-[#FFB7C5] transition-all cursor-pointer">
                          {copied === inv.token ? <FiCheck className="text-emerald-500" /> : <FiCopy />}
                        </button>
                        <button onClick={() => revoke(inv.token)} title="Revocar"
                          className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all cursor-pointer">
                          <FiX />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
