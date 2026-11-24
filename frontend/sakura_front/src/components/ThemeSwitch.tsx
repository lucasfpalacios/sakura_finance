"use client";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { FiSun, FiMoon } from "react-icons/fi";

// compact: botón redondo de un solo ícono (barra de escritorio, donde falta espacio)
export default function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    // eslint-disable-next-line
    setMounted(true);
  }, []);
  if (!mounted) return null;

  const currentTheme = theme === "system" ? resolvedTheme : theme;
  const isDark = currentTheme === "dark";

  if (compact) {
    return (
      <button
        type="button"
        aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        title={isDark ? "Modo claro" : "Modo oscuro"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="shrink-0 p-2 rounded-xl text-lg text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1a1a1a] transition-all cursor-pointer"
      >
        {isDark ? <FiSun className="text-yellow-400" /> : <FiMoon />}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo claro" : "Modo oscuro"}
      // shrink-0: si el contenedor se achica, la bolita se salía del óvalo
      className="relative shrink-0 w-16 h-8 flex items-center bg-slate-300 dark:bg-[#222] rounded-full p-1 cursor-pointer shadow-inner transition-colors duration-300"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {/* ☀️ Icono Sol */}
      <span className="text-yellow-500 z-10 ml-0.5 text-lg"><FiSun /></span>
      
      {/* ⚪️ El círculo que se mueve */}
      <div
        className={`absolute left-1 top-1 bg-white dark:bg-[#FFB7C5] w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${
          isDark ? "translate-x-8" : "translate-x-0"
        }`}
      />
      
      {/* 🌙 Icono Luna */}
      <span className="text-slate-400 dark:text-slate-100 z-10 ml-auto mr-0.5 text-lg"><FiMoon /></span>
    </button>
  );
}