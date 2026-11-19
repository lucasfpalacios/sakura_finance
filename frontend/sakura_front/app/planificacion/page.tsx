"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useCurrency } from "../context/CurrencyContext";
import Link from "next/link";
import { FiPlus, FiTrash2, FiEdit2, FiX, FiCalendar, FiCheck } from "react-icons/fi";

type Kind = "fixed" | "planned" | "goals";
type Cur = "ARS" | "USD" | "EUR";

interface PlanItem {
  id: string;
  name: string;
  amount: number;
  currency: Cur;
  date: string | null;
  saved: number;
}

interface Plan {
  monthly_income: number;
  income_currency: Cur;
  fixed: PlanItem[];
  planned: PlanItem[];
  goals: PlanItem[];
  debt_months: Record<string, number>;
}

interface Debt {
  id: string;
  creditor: string;
  amount: number;
  currency: Cur;
  description: string;
  due_date: string | null;
  status: "pending" | "paid";
}

const API = `${process.env.NEXT_PUBLIC_API_URL}/api/planning`;
const DEBTS_API = `${process.env.NEXT_PUBLIC_API_URL}/api/debts`;
const CURRENCIES: Cur[] = ["ARS", "USD", "EUR"];
const MONTH_OPTIONS = [1, 2, 3, 4, 5, 6, 9, 12, 18, 24, 36, 48, 60];
const DEBT_BAR = "bg-sky-400";

// Textos y colores de cada sección
const KIND_CONFIG: Record<Kind, {
  title: string; singular: string; emoji: string; help: string;
  namePlaceholder: string; amountLabel: string; dateLabel?: string; dateRequired?: boolean;
  bar: string;
}> = {
  fixed: {
    title: "Gastos fijos", singular: "Gasto fijo", emoji: "🏠",
    help: "Se repiten todos los meses: alquiler, servicios, suscripciones.",
    namePlaceholder: "Ej: Alquiler, Netflix, Gimnasio", amountLabel: "Monto mensual",
    bar: "bg-rose-400",
  },
  planned: {
    title: "Gastos proyectados", singular: "Gasto proyectado", emoji: "🗓️",
    help: "Gastos puntuales a futuro. Se calcula cuánto reservar por mes hasta la fecha.",
    namePlaceholder: "Ej: Viaje, Notebook nueva, Regalo", amountLabel: "Monto",
    dateLabel: "Fecha estimada", dateRequired: true,
    bar: "bg-amber-400",
  },
  goals: {
    title: "Metas de ahorro", singular: "Meta de ahorro", emoji: "🎯",
    help: "Objetivos con monto. Si tienen fecha límite, se calcula el aporte mensual.",
    namePlaceholder: "Ej: Fondo de emergencia", amountLabel: "Monto objetivo",
    dateLabel: "Fecha límite (opcional)",
    bar: "bg-violet-400",
  },
};

// Meses enteros desde el mes actual hasta el mes de la fecha (negativo si ya pasó)
function monthsUntil(date: string): number {
  const now = new Date();
  const [y, m] = date.split("-").map(Number);
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
}

function isPast(date: string): boolean {
  return date < new Date().toISOString().split("T")[0];
}

function formatOriginal(amount: number, currency: string) {
  return new Intl.NumberFormat(currency === "ARS" ? "es-AR" : "en-US", {
    style: "currency", currency, minimumFractionDigits: currency === "ARS" ? 0 : 2,
  }).format(amount);
}

export default function PlanificacionPage() {
  const { currency, rates, formatCurrency } = useCurrency();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Ingreso
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState("");
  const [incomeCurrency, setIncomeCurrency] = useState<Cur>("ARS");

  // Modal de alta/edición
  const [formKind, setFormKind] = useState<Kind | null>(null);
  const [editingItem, setEditingItem] = useState<PlanItem | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [itemCurrency, setItemCurrency] = useState<Cur>("ARS");
  const [date, setDate] = useState("");
  const [saved, setSaved] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const PlusIcon = FiPlus;
  const TrashIcon = FiTrash2;
  const EditIcon = FiEdit2;
  const XIcon = FiX;
  const CalendarIcon = FiCalendar;
  const CheckIcon = FiCheck;

  const fetchPlan = async () => {
    try {
      const [res, debtsRes] = await Promise.all([fetch(API), fetch(DEBTS_API)]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPlan(await res.json());
      // Si falla deudas, la planificación igual se muestra
      if (debtsRes.ok) setDebts(await debtsRes.json());
      setError("");
    } catch (err) {
      console.error("Error al cargar la planificación:", err);
      setError("No se pudo cargar la planificación. Revisa que el backend esté funcionando.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlan(); }, []);

  const toARS = useCallback((value: number, cur: string) => value * (rates[cur as Cur] || 1), [rates]);

  // ---- Cálculos (todo en ARS; formatCurrency convierte a la moneda elegida) ----
  const summary = useMemo(() => {
    if (!plan) return null;
    const income = toARS(plan.monthly_income, plan.income_currency);
    const fixed = plan.fixed.reduce((s, i) => s + toARS(i.amount, i.currency), 0);

    const planned = plan.planned.map(i => {
      const past = !!i.date && isPast(i.date);
      const months = i.date ? Math.max(1, monthsUntil(i.date)) : 1;
      const monthly = past ? 0 : toARS(i.amount, i.currency) / months;
      return { ...i, past, months, monthly };
    });
    const plannedMonthly = planned.reduce((s, i) => s + i.monthly, 0);

    const goals = plan.goals.map(i => {
      const remaining = Math.max(0, i.amount - i.saved);
      const progress = i.amount > 0 ? Math.min(100, (i.saved / i.amount) * 100) : 0;
      const past = !!i.date && isPast(i.date);
      const months = i.date ? Math.max(1, monthsUntil(i.date)) : 0;
      const monthly = i.date && !past && remaining > 0 ? toARS(remaining, i.currency) / months : 0;
      return { ...i, remaining, progress, past, months, monthly };
    });
    const goalsMonthly = goals.reduce((s, i) => s + i.monthly, 0);

    const debtItems = debts.filter(d => d.status === "pending").map(d => {
      const months = plan.debt_months?.[d.id] ?? 0;
      const monthly = months > 0 ? toARS(d.amount, d.currency) / months : 0;
      const dueMonths = d.due_date ? monthsUntil(d.due_date) : null;
      // Avisar si el plazo elegido termina después del vencimiento
      const lateVsDue = months > 0 && dueMonths !== null && months > Math.max(1, dueMonths);
      return { ...d, months, monthly, dueMonths, lateVsDue };
    });
    const debtsMonthly = debtItems.reduce((s, d) => s + d.monthly, 0);
    const debtsTotal = debtItems.reduce((s, d) => s + toARS(d.amount, d.currency), 0);

    const committed = fixed + plannedMonthly + goalsMonthly + debtsMonthly;
    return { income, fixed, planned, plannedMonthly, goals, goalsMonthly, debtItems, debtsMonthly, debtsTotal, committed, free: income - committed };
  }, [plan, debts, toARS]);

  // ---- Acciones ----
  const openIncomeEdit = () => {
    if (!plan) return;
    setIncomeInput(plan.monthly_income ? String(plan.monthly_income) : "");
    setIncomeCurrency(plan.income_currency);
    setEditingIncome(true);
  };

  const saveIncome = async () => {
    const value = parseFloat(incomeInput);
    if (isNaN(value) || value < 0) return;
    const res = await fetch(`${API}/income`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: value, currency: incomeCurrency }),
    });
    if (res.ok) { setEditingIncome(false); fetchPlan(); }
  };

  const openForm = (kind: Kind, item: PlanItem | null = null) => {
    setFormKind(kind);
    setEditingItem(item);
    setName(item?.name ?? "");
    setAmount(item ? String(item.amount) : "");
    setItemCurrency(item?.currency ?? currency);
    setDate(item?.date ?? "");
    setSaved(item && item.saved ? String(item.saved) : "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formKind) return;
    const parsedAmount = parseFloat(amount);
    if (!name.trim() || isNaN(parsedAmount) || parsedAmount <= 0) return;

    const body: Record<string, unknown> = {
      name: name.trim(),
      amount: parsedAmount,
      currency: itemCurrency,
      date: formKind === "fixed" ? null : date || null,
      saved: formKind === "goals" ? parseFloat(saved) || 0 : 0,
    };

    setIsSubmitting(true);
    try {
      const res = await fetch(editingItem ? `${API}/${formKind}/${editingItem.id}` : `${API}/${formKind}`, {
        method: editingItem ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { setFormKind(null); fetchPlan(); }
    } catch (err) {
      console.error("Error al guardar:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const setDebtMonths = async (debtId: string, months: number | null) => {
    // Actualización optimista para que el select responda al instante
    setPlan(p => {
      if (!p) return p;
      const debt_months = { ...(p.debt_months ?? {}) };
      if (months) debt_months[debtId] = months; else delete debt_months[debtId];
      return { ...p, debt_months };
    });
    const res = await fetch(`${API}/debts/${debtId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months }),
    });
    if (!res.ok) fetchPlan();
  };

  // Corrige la moneda en la deuda original (sección Deudas)
  const setDebtCurrency = async (debtId: string, cur: Cur) => {
    setDebts(ds => ds.map(d => (d.id === debtId ? { ...d, currency: cur } : d)));
    const res = await fetch(`${DEBTS_API}/${debtId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency: cur }),
    });
    if (!res.ok) fetchPlan();
  };

  const handleDelete = async (kind: Kind, item: PlanItem) => {
    if (!confirm(`¿Eliminar "${item.name}"?`)) return;
    const res = await fetch(`${API}/${kind}/${item.id}`, { method: "DELETE" });
    if (res.ok) fetchPlan();
  };

  // ---- UI helpers ----
  const card = "bg-white dark:bg-[#111] rounded-3xl border border-slate-200 dark:border-[#222] shadow-[0_4px_20px_rgba(0,0,0,0.02)]";
  const input = "w-full px-4 py-3 bg-slate-50 dark:bg-[#161616] border border-slate-200 dark:border-[#222] rounded-2xl text-sm font-semibold outline-none focus:border-pink-400 dark:focus:border-[#FFB7C5] transition-colors";
  const label = "text-xs font-bold text-slate-400 uppercase tracking-wider";

  // Funciones de render (no componentes) para no recrear componentes en cada render
  const currencyToggle = (value: Cur, onChange: (c: Cur) => void) => (
    <div className="flex bg-slate-100 dark:bg-[#161616] rounded-xl p-1 border border-slate-200 dark:border-[#222]">
      {CURRENCIES.map(c => (
        <button
          key={c} type="button" onClick={() => onChange(c)}
          className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${value === c ? "bg-white dark:bg-[#222] text-pink-500 dark:text-[#FFB7C5] shadow-sm" : "text-slate-500"}`}
        >
          {c}
        </button>
      ))}
    </div>
  );

  const itemActions = (kind: Kind, item: PlanItem) => (
    <div className="flex gap-1 shrink-0">
      <button onClick={() => openForm(kind, item)} title="Editar"
        className="p-1.5 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-500/10 dark:hover:text-[#FFB7C5] transition-all cursor-pointer">
        <EditIcon size={14} />
      </button>
      <button onClick={() => handleDelete(kind, item)} title="Eliminar"
        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all cursor-pointer">
        <TrashIcon size={14} />
      </button>
    </div>
  );

  const amountText = (item: PlanItem) => (
    <div className="text-right shrink-0">
      <p className="text-sm font-extrabold text-slate-950 dark:text-white">{formatOriginal(item.amount, item.currency)}</p>
      {currency !== item.currency && (
        <p className="text-[10px] font-bold text-slate-400 uppercase">≈ {formatCurrency(toARS(item.amount, item.currency))}</p>
      )}
    </div>
  );

  const section = (kind: Kind, total: number, totalLabel: string, count: number, children: React.ReactNode) => {
    const cfg = KIND_CONFIG[kind];
    return (
      <div className={`${card} p-6 flex flex-col gap-4`}>
        <div className="flex justify-between items-start gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{cfg.emoji} {cfg.title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{cfg.help}</p>
          </div>
          <button onClick={() => openForm(kind)} title={`Agregar ${cfg.singular.toLowerCase()}`}
            className="p-2 rounded-xl bg-pink-50 dark:bg-[#FFB7C5]/10 text-pink-500 dark:text-[#FFB7C5] hover:scale-105 transition-all cursor-pointer shrink-0">
            <PlusIcon size={18} />
          </button>
        </div>
        <div className="flex justify-between items-baseline border-b border-slate-100 dark:border-[#222] pb-3">
          <span className={label}>{totalLabel}</span>
          <span className="text-xl font-extrabold text-slate-900 dark:text-white">{formatCurrency(total)}</span>
        </div>
        {count === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-6">Todavía no agregaste nada.</p>
        ) : (
          <div className="flex flex-col gap-3">{children}</div>
        )}
      </div>
    );
  };

  const itemBox = "p-4 rounded-2xl bg-slate-50 dark:bg-[#161616] border border-slate-100 dark:border-[#222]/50 flex flex-col gap-2";

  // ---- Render ----
  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-pink-400 dark:border-[#FFB7C5]"></div>
      </div>
    );
  }

  if (error || !plan || !summary) {
    return <p className="text-center text-red-500 py-32 font-semibold">{error || "Error desconocido"}</p>;
  }

  const pct = (v: number) => (summary.income > 0 ? Math.min(100, (v / summary.income) * 100) : 0);
  // Segmentos apilados de la barra, recortados para no pasar del 100%
  const barSegments = [
    { value: summary.fixed, cls: KIND_CONFIG.fixed.bar },
    { value: summary.plannedMonthly, cls: KIND_CONFIG.planned.bar },
    { value: summary.goalsMonthly, cls: KIND_CONFIG.goals.bar },
    { value: summary.debtsMonthly, cls: DEBT_BAR },
  ].reduce<{ cls: string; width: number; used: number }[]>((acc, seg) => {
    const used = acc.length ? acc[acc.length - 1].used : 0;
    const width = Math.max(0, Math.min(pct(seg.value), 100 - used));
    return [...acc, { cls: seg.cls, width, used: used + width }];
  }, []);
  const overBudget = summary.free < 0;

  return (
    <div className="min-h-screen font-sans bg-slate-50 dark:bg-[#0a0a0a] text-slate-800 dark:text-slate-200 py-8 px-4 sm:px-8 max-w-[100vw] overflow-x-hidden">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">

        {/* Header */}
        <header className="border-b border-slate-200 dark:border-[#222] pb-6">
          <span className="text-pink-500 dark:text-[#FFB7C5] font-semibold text-sm tracking-wide uppercase">Sakura Planner</span>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mt-1 tracking-tight">Planificación</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Organiza tus gastos fijos, proyecta gastos futuros y descubre cuánto puedes ahorrar cada mes.</p>
        </header>

        {/* Ingreso + resumen */}
        <div className={`${card} p-6 flex flex-col gap-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className={label}>Ingreso mensual esperado</span>
              {editingIncome ? (
                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                  <input type="number" min="0" step="any" autoFocus value={incomeInput}
                    onChange={e => setIncomeInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveIncome()}
                    placeholder="Ej: 1500000" className={`${input} sm:w-48`} />
                  {currencyToggle(incomeCurrency, setIncomeCurrency)}
                  <div className="flex gap-2">
                    <button onClick={saveIncome} title="Guardar"
                      className="p-3 rounded-xl bg-emerald-500 text-white hover:opacity-90 cursor-pointer"><CheckIcon /></button>
                    <button onClick={() => setEditingIncome(false)} title="Cancelar"
                      className="p-3 rounded-xl bg-slate-100 dark:bg-[#222] text-slate-500 cursor-pointer"><XIcon /></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-3xl font-extrabold text-slate-900 dark:text-white">
                    {plan.monthly_income ? formatCurrency(summary.income) : "Sin definir"}
                  </p>
                  <button onClick={openIncomeEdit} title="Editar ingreso"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-pink-500 transition-all cursor-pointer"><EditIcon size={16} /></button>
                </div>
              )}
            </div>
            <div className="sm:text-right">
              <span className={label}>{overBudget ? "Te faltan por mes" : "Libre para ahorrar por mes"}</span>
              <p className={`text-3xl font-extrabold mt-1 ${overBudget ? "text-red-500" : "text-emerald-500 dark:text-emerald-400"}`}>
                {formatCurrency(Math.abs(summary.free))}
              </p>
            </div>
          </div>

          {/* Barra de distribución del ingreso */}
          {summary.income > 0 && (
            <div className="flex flex-col gap-3">
              <div className="w-full h-4 rounded-full overflow-hidden flex bg-emerald-200 dark:bg-emerald-900/40">
                {barSegments.map(seg => (
                  <div key={seg.cls} className={seg.cls} style={{ width: `${seg.width}%` }} />
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                {[
                  { label: "Gastos fijos", value: summary.fixed, dot: KIND_CONFIG.fixed.bar },
                  { label: "Reserva proyectados", value: summary.plannedMonthly, dot: KIND_CONFIG.planned.bar },
                  { label: "Aporte a metas", value: summary.goalsMonthly, dot: KIND_CONFIG.goals.bar },
                  { label: "Pago de deudas", value: summary.debtsMonthly, dot: DEBT_BAR },
                  { label: "Libre", value: Math.max(0, summary.free), dot: "bg-emerald-300 dark:bg-emerald-700" },
                ].map(s => (
                  <div key={s.label} className="flex items-start gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${s.dot}`} />
                    <div>
                      <p className="font-bold text-slate-500 dark:text-slate-400">{s.label} · {pct(s.value).toFixed(0)}%</p>
                      <p className="font-extrabold text-slate-900 dark:text-white">{formatCurrency(s.value)}</p>
                    </div>
                  </div>
                ))}
              </div>
              {overBudget && (
                <p className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 rounded-xl px-3 py-2">
                  Tus compromisos mensuales superan tu ingreso. Prueba mover fechas más lejos, alargar el plazo de alguna deuda o reducir algún gasto fijo.
                </p>
              )}
            </div>
          )}
          {summary.income === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">Carga tu ingreso mensual para ver cuánto te queda libre para ahorrar.</p>
          )}
        </div>

        {/* Secciones */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {section("fixed", summary.fixed, "Total por mes", plan.fixed.length,
            plan.fixed.map(item => (
              <div key={item.id} className={itemBox}>
                <div className="flex justify-between items-start gap-3">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.name}</p>
                  {amountText(item)}
                </div>
                <div className="flex justify-end">{itemActions("fixed", item)}</div>
              </div>
            ))
          )}

          {section("planned", summary.plannedMonthly, "Reservar por mes", plan.planned.length,
            summary.planned.map(item => (
              <div key={item.id} className={itemBox}>
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.name}</p>
                    {item.date && (
                      <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400 mt-1">
                        <CalendarIcon size={10} /> {item.date}
                      </p>
                    )}
                  </div>
                  {amountText(item)}
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className={`text-xs font-semibold ${item.past ? "text-slate-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {item.past
                      ? "Fecha pasada"
                      : `${formatCurrency(item.monthly)}/mes · ${item.months} ${item.months === 1 ? "mes" : "meses"}`}
                  </span>
                  {itemActions("planned", item)}
                </div>
              </div>
            ))
          )}

          {section("goals", summary.goalsMonthly, "Aportar por mes", plan.goals.length,
            summary.goals.map(item => (
              <div key={item.id} className={itemBox}>
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.name}</p>
                    {item.date && (
                      <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400 mt-1">
                        <CalendarIcon size={10} /> {item.date}
                      </p>
                    )}
                  </div>
                  {amountText(item)}
                </div>
                <div className="w-full bg-slate-200 dark:bg-[#222] h-2 rounded-full overflow-hidden">
                  <div className="bg-violet-400 h-full rounded-full transition-all duration-500" style={{ width: `${item.progress}%` }} />
                </div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {formatOriginal(item.saved, item.currency)} ahorrado · {item.progress.toFixed(0)}%
                </p>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                    {item.remaining === 0
                      ? "¡Meta cumplida! 🎉"
                      : !item.date
                        ? "Sin fecha límite"
                        : item.past
                          ? "Fecha límite pasada"
                          : `${formatCurrency(item.monthly)}/mes · ${item.months} ${item.months === 1 ? "mes" : "meses"}`}
                  </span>
                  {itemActions("goals", item)}
                </div>
              </div>
            ))
          )}

          {/* Pago de deudas: toma las deudas pendientes de la sección Deudas */}
          <div className={`${card} p-6 flex flex-col gap-4 lg:col-span-3`}>
            <div className="flex justify-between items-start gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">💳 Pago de deudas</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Tus deudas pendientes. Elige en cuántos meses quieres pagar cada una y se calcula cuánto apartar por mes.
                </p>
              </div>
              <Link href="/deudas"
                className="text-xs font-bold text-pink-500 dark:text-[#FFB7C5] hover:underline shrink-0">
                Ir a Deudas →
              </Link>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between gap-2 border-b border-slate-100 dark:border-[#222] pb-3">
              <div className="flex justify-between sm:block items-baseline gap-3">
                <span className={label}>Total adeudado</span>
                <span className="sm:block text-xl font-extrabold text-slate-900 dark:text-white">{formatCurrency(summary.debtsTotal)}</span>
              </div>
              <div className="flex justify-between sm:block sm:text-right items-baseline gap-3">
                <span className={label}>Apartar por mes</span>
                <span className="sm:block text-xl font-extrabold text-sky-600 dark:text-sky-400">{formatCurrency(summary.debtsMonthly)}</span>
              </div>
            </div>
            {summary.debtItems.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-6">No tienes deudas pendientes. 🎉</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {summary.debtItems.map(d => {
                  const options = MONTH_OPTIONS.includes(d.months) || d.months === 0
                    ? MONTH_OPTIONS
                    : [...MONTH_OPTIONS, d.months].sort((a, b) => a - b);
                  return (
                    <div key={d.id} className={itemBox}>
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{d.creditor}</p>
                          {d.description && <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{d.description}</p>}
                          {d.due_date && (
                            <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400 mt-1">
                              <CalendarIcon size={10} /> Vence {d.due_date}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-extrabold text-slate-950 dark:text-white">{formatOriginal(d.amount, d.currency)}</p>
                          {currency !== d.currency && (
                            <p className="text-[10px] font-bold text-slate-400 uppercase">≈ {formatCurrency(toARS(d.amount, d.currency))}</p>
                          )}
                          <select
                            value={d.currency}
                            onChange={e => setDebtCurrency(d.id, e.target.value as Cur)}
                            title="Moneda de la deuda"
                            className="mt-1 px-2 py-1 bg-white dark:bg-[#111] border border-slate-200 dark:border-[#222] rounded-lg text-[10px] font-bold outline-none focus:border-pink-400 dark:focus:border-[#FFB7C5] cursor-pointer"
                          >
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-between items-center gap-3">
                        <select
                          value={d.months || ""}
                          onChange={e => setDebtMonths(d.id, e.target.value ? Number(e.target.value) : null)}
                          className="px-3 py-2 bg-white dark:bg-[#111] border border-slate-200 dark:border-[#222] rounded-xl text-xs font-bold outline-none focus:border-pink-400 dark:focus:border-[#FFB7C5] cursor-pointer"
                        >
                          <option value="">Elegir plazo…</option>
                          {options.map(m => (
                            <option key={m} value={m}>{m} {m === 1 ? "mes" : "meses"}</option>
                          ))}
                        </select>
                        <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 text-right">
                          {d.months > 0 ? `${formatCurrency(d.monthly)}/mes` : <span className="text-slate-400">Sin plazo, no suma</span>}
                        </span>
                      </div>
                      {d.lateVsDue && (
                        <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          ⚠️ Con este plazo terminarías después del vencimiento ({Math.max(0, d.dueMonths ?? 0)} {d.dueMonths === 1 ? "mes" : "meses"}).
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal alta/edición */}
      {formKind && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-[#111] rounded-[2.5rem] border border-slate-200 dark:border-[#222] max-w-md w-full p-8 shadow-2xl flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {editingItem ? "Editar" : "Nuevo"} {KIND_CONFIG[formKind].singular.toLowerCase()}
              </h2>
              <button onClick={() => setFormKind(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1a1a1a] cursor-pointer">
                <XIcon className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className={label}>Nombre</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)}
                  placeholder={KIND_CONFIG[formKind].namePlaceholder} className={input} />
              </div>

              <div className="flex flex-col gap-2">
                <label className={label}>{KIND_CONFIG[formKind].amountLabel}</label>
                <input type="number" required step="any" min="0.01" value={amount}
                  onChange={e => setAmount(e.target.value)} placeholder="0" className={`${input} text-right`} />
                {currencyToggle(itemCurrency, setItemCurrency)}
              </div>

              {formKind === "goals" && (
                <div className="flex flex-col gap-2">
                  <label className={label}>Ya ahorrado ({itemCurrency})</label>
                  <input type="number" step="any" min="0" value={saved}
                    onChange={e => setSaved(e.target.value)} placeholder="0" className={`${input} text-right`} />
                </div>
              )}

              {KIND_CONFIG[formKind].dateLabel && (
                <div className="flex flex-col gap-2">
                  <label className={label}>{KIND_CONFIG[formKind].dateLabel}</label>
                  <input type="date" required={KIND_CONFIG[formKind].dateRequired} value={date}
                    onChange={e => setDate(e.target.value)} className={`${input} cursor-pointer`} />
                </div>
              )}

              <button type="submit" disabled={isSubmitting}
                className="w-full mt-2 bg-gradient-to-r from-pink-500 to-rose-500 dark:from-[#FFB7C5] dark:to-[#ffa0b3] text-white dark:text-black font-extrabold py-3.5 rounded-2xl hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer text-sm">
                {isSubmitting ? "Guardando..." : editingItem ? "Guardar cambios" : "Agregar"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
