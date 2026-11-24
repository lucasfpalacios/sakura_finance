"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiPlus, FiEdit2, FiTrash2, FiX, FiChevronLeft, FiChevronRight, FiCheck } from "react-icons/fi";
import { useCurrency } from "../context/CurrencyContext";
import { API_URL, apiFetch } from "../../src/lib/api";
import {
  CardsData, CreditCard, CardPurchase, CardCurrency, Statement,
  CARD_COLORS, cardGradient, cardDebtARS, firstStatementMonth, formatDay, formatMoney,
  monthLabel, statementDates, nextStatements, overdueStatements, shiftMonth, statementARS,
} from "../../src/lib/cards";
import { PageSkeleton } from "../../src/components/Skeleton";

const API = `${API_URL}/api/cards`;
const todayISO = () => new Date().toISOString().split("T")[0];
const currentMonth = () => todayISO().slice(0, 7);

export default function TarjetasPage() {
  const { rates, formatCurrency } = useCurrency();
  const [data, setData] = useState<CardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState<string>(currentMonth());

  // Modal tarjeta
  const [cardForm, setCardForm] = useState<null | { editing: CreditCard | null }>(null);
  const [cName, setCName] = useState("");
  const [cBank, setCBank] = useState("");
  const [cClosing, setCClosing] = useState("25");
  const [cDue, setCDue] = useState("5");
  const [cLimit, setCLimit] = useState("");
  const [cColor, setCColor] = useState("pink");

  // Modal compra
  const [purchaseForm, setPurchaseForm] = useState<null | { editing: CardPurchase | null }>(null);
  const [pCard, setPCard] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pCurrency, setPCurrency] = useState<CardCurrency>("ARS");
  const [pDate, setPDate] = useState(todayISO());
  const [pInstallments, setPInstallments] = useState("1");
  const [pStatement, setPStatement] = useState(""); // "" = automático según la fecha de compra
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const firstLoad = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch(API);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d: CardsData = await res.json();
      setData(d);
      setError("");
      setSelectedId(id => (id && d.cards.some(c => c.id === id) ? id : d.cards[0]?.id ?? null));
      if (firstLoad.current && d.cards[0]) {
        // Al entrar, mostrar el próximo resumen a pagar de la primera tarjeta
        firstLoad.current = false;
        const next = nextStatements(d.statements).find(st => st.card_id === d.cards[0].id);
        if (next) setViewMonth(next.month);
      }
    } catch (err) {
      console.error("Error al cargar tarjetas:", err);
      setError("No se pudieron cargar las tarjetas. Revisa que el backend esté funcionando.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selected = data?.cards.find(c => c.id === selectedId) ?? null;
  const upcoming = useMemo(() => (data ? nextStatements(data.statements) : []), [data]);
  const overdue = useMemo(() => (data ? overdueStatements(data.statements) : []), [data]);

  // Al elegir tarjeta, mostrar su próximo resumen a pagar
  const selectCard = (card: CreditCard) => {
    setSelectedId(card.id);
    const next = upcoming.find(s => s.card_id === card.id);
    setViewMonth(next?.month ?? currentMonth());
  };

  const statement: Statement | undefined = data?.statements.find(s => s.card_id === selectedId && s.month === viewMonth);
  const totalUpcomingARS = upcoming.reduce((sum, s) => sum + statementARS(s, rates), 0);

  // ---- Tarjeta: alta / edición ----
  const openCardForm = (card: CreditCard | null = null) => {
    setCardForm({ editing: card });
    setCName(card?.name ?? "");
    setCBank(card?.bank ?? "");
    setCClosing(String(card?.closing_day ?? 25));
    setCDue(String(card?.due_day ?? 5));
    setCLimit(card?.limit ? String(card.limit) : "");
    setCColor(card?.color ?? "pink");
    setFormError("");
  };

  const submitCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardForm) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        name: cName.trim(), bank: cBank.trim(),
        closing_day: Number(cClosing), due_day: Number(cDue),
        limit: cLimit ? Number(cLimit) : null, color: cColor,
      };
      const res = await apiFetch(cardForm.editing ? `${API}/${cardForm.editing.id}` : API, {
        method: cardForm.editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const card: CreditCard = await res.json();
      setCardForm(null);
      setSelectedId(card.id);
      await fetchData();
    } catch {
      setFormError("No se pudo guardar la tarjeta. Revisa los datos.");
    } finally {
      setSaving(false);
    }
  };

  const deleteCard = async (card: CreditCard) => {
    if (!confirm(`¿Eliminar "${card.name}" y todas sus compras?`)) return;
    const res = await apiFetch(`${API}/${card.id}`, { method: "DELETE" });
    if (res.ok) fetchData();
  };

  // ---- Compra: alta / edición ----
  const openPurchaseForm = (purchase: CardPurchase | null = null) => {
    setPurchaseForm({ editing: purchase });
    setPCard(purchase?.card_id ?? selectedId ?? data?.cards[0]?.id ?? "");
    setPDesc(purchase?.description ?? "");
    setPAmount(purchase ? String(purchase.amount) : "");
    setPCurrency(purchase?.currency ?? "ARS");
    setPDate(purchase?.date ?? todayISO());
    setPStatement(purchase?.statement_month ?? "");
    setPInstallments(String(purchase?.installments ?? 1));
    setFormError("");
  };

  const submitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseForm || !pCard) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        description: pDesc.trim(), amount: Number(pAmount), currency: pCurrency,
        date: pDate, installments: Math.max(1, Number(pInstallments) || 1),
        statement_month: pStatement || null,
      };
      const editing = purchaseForm.editing;
      const res = await apiFetch(editing ? `${API}/purchases/${editing.id}` : `${API}/${pCard}/purchases`, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...body, card_id: pCard } : body),
      });
      if (!res.ok) throw new Error();
      setPurchaseForm(null);
      // Mostrar el resumen donde cae la compra
      const card = data?.cards.find(c => c.id === pCard);
      if (card) {
        setSelectedId(card.id);
        setViewMonth(pStatement || firstStatementMonth(pDate, card.closing_day));
      }
      await fetchData();
    } catch {
      setFormError("No se pudo guardar la compra. Revisa los datos.");
    } finally {
      setSaving(false);
    }
  };

  const deletePurchase = async (purchaseId: string, description: string) => {
    if (!confirm(`¿Eliminar "${description}"? Se borran todas sus cuotas.`)) return;
    const res = await apiFetch(`${API}/purchases/${purchaseId}`, { method: "DELETE" });
    if (res.ok) fetchData();
  };

  const togglePaid = async (st: Statement) => {
    const res = await apiFetch(`${API}/${st.card_id}/statements/${st.month}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: !st.paid }),
    });
    if (res.ok) fetchData();
  };

  // ---- UI ----
  const card = "bg-white dark:bg-[#111] rounded-3xl border border-slate-200 dark:border-[#222] shadow-[0_4px_20px_rgba(0,0,0,0.02)]";
  const input = "w-full px-4 py-3 bg-slate-50 dark:bg-[#161616] border border-slate-200 dark:border-[#222] rounded-2xl text-sm font-semibold outline-none focus:border-pink-400 dark:focus:border-[#FFB7C5] transition-colors";
  const label = "text-xs font-bold text-slate-400 uppercase tracking-wider";
  const primaryBtn = "bg-gradient-to-r from-pink-500 to-rose-500 dark:from-[#FFB7C5] dark:to-[#ffa0b3] text-white dark:text-black font-extrabold rounded-2xl hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer";

  if (loading) return <PageSkeleton stats={0} blocks={2} />;
  if (error || !data) return <p className="text-center text-red-500 py-32 font-semibold">{error || "Error desconocido"}</p>;

  const purchaseCard = data.cards.find(c => c.id === pCard);
  const instN = Math.max(1, Number(pInstallments) || 1);
  const amountN = Number(pAmount);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] text-slate-800 dark:text-slate-200 py-8 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">

        {/* Header */}
        <header className="border-b border-slate-200 dark:border-[#222] pb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <span className="text-pink-500 dark:text-[#FFB7C5] font-semibold text-sm tracking-wide uppercase">Sakura Cards</span>
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mt-1 tracking-tight">Tarjetas</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Controla tus compras con tarjeta, las cuotas y cuánto pagas en cada resumen.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => openCardForm()} className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-[#222] text-sm font-bold text-slate-600 dark:text-slate-300 hover:border-pink-300 dark:hover:border-[#FFB7C5]/50 transition-all cursor-pointer">
              <FiPlus /> Tarjeta
            </button>
            {data.cards.length > 0 && (
              <button onClick={() => openPurchaseForm()} className={`flex items-center gap-2 px-4 py-2.5 text-sm ${primaryBtn}`}>
                <FiPlus /> Compra
              </button>
            )}
          </div>
        </header>

        {data.cards.length === 0 ? (
          <div className={`${card} p-10 flex flex-col items-center text-center gap-4`}>
            <p className="text-5xl">💳</p>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Agrega tu primera tarjeta</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">Con el día de cierre y de vencimiento calculamos en qué resumen cae cada compra y cada cuota.</p>
            <button onClick={() => openCardForm()} className={`px-6 py-3 text-sm ${primaryBtn}`}>Agregar tarjeta</button>
          </div>
        ) : (
          <>
            {/* Resumen general */}
            <div className={`${card} p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4`}>
              <div>
                <span className={label}>Próximos vencimientos</span>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">{formatCurrency(totalUpcomingARS)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Suma del próximo resumen de cada tarjeta (USD convertido al valor actual).</p>
              </div>
              <div className="flex flex-col gap-1.5 sm:items-end">
                {upcoming.map(s => {
                  const c = data.cards.find(x => x.id === s.card_id);
                  return (
                    <p key={s.card_id} className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <span className="font-bold text-slate-700 dark:text-slate-200">{c?.name}</span> · vence {formatDay(s.due_date)} ·{" "}
                      {s.total_ars > 0 && formatMoney(s.total_ars, "ARS")}{s.total_ars > 0 && s.total_usd > 0 && " + "}{s.total_usd > 0 && formatMoney(s.total_usd, "USD")}
                    </p>
                  );
                })}
                {overdue.length > 0 && (
                  <p className="text-xs font-bold text-red-500">⚠️ {overdue.length} resumen{overdue.length > 1 ? "es" : ""} vencido{overdue.length > 1 ? "s" : ""} sin marcar como pagado</p>
                )}
              </div>
            </div>

            {/* Tarjetas */}
            <div className="flex gap-4 overflow-x-auto p-3 -m-3 snap-x">
              {data.cards.map(c => {
                const next = upcoming.find(s => s.card_id === c.id);
                const debt = cardDebtARS(data.statements, c.id, rates);
                const usage = c.limit ? Math.min(100, (debt / c.limit) * 100) : null;
                const isSel = c.id === selectedId;
                return (
                  <button key={c.id} onClick={() => (isSel ? openCardForm(c) : selectCard(c))}
                    title={isSel ? "Editar tarjeta" : "Ver resúmenes"}
                    className={`snap-start shrink-0 w-72 h-44 rounded-3xl p-5 text-left text-white bg-gradient-to-br ${cardGradient(c.color)} shadow-lg flex flex-col justify-between transition-all cursor-pointer ${isSel ? "ring-2 ring-offset-4 ring-pink-400 ring-offset-slate-50 dark:ring-[#FFB7C5] dark:ring-offset-[#0a0a0a]" : "opacity-75 hover:opacity-100"}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-lg font-extrabold leading-tight">{c.name}</p>
                        {c.bank && <p className="text-xs font-semibold text-white/80">{c.bank}</p>}
                      </div>
                      <span className="text-2xl">💳</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Próximo resumen</p>
                      {next
                        ? <p className="text-xl font-extrabold">{formatCurrency(statementARS(next, rates))}</p>
                        : <p className="text-sm font-bold text-white/90 py-1">Sin cuotas pendientes</p>}
                    </div>
                    <div className="flex justify-between items-end gap-3 text-[11px] font-semibold text-white/85">
                      <span>Cierra {c.closing_day} · Vence {c.due_day}</span>
                      {usage !== null && <span>{usage.toFixed(0)}% del límite</span>}
                    </div>
                    {usage !== null && (
                      <div className="w-full h-1.5 rounded-full bg-white/25 overflow-hidden -mt-2">
                        <div className="h-full bg-white rounded-full" style={{ width: `${usage}%` }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Resumen de la tarjeta elegida */}
            {selected && (
              <div className={`${card} p-6 flex flex-col gap-5`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{selected.name}</h2>
                    <button onClick={() => openCardForm(selected)} title="Editar tarjeta" className="p-1.5 rounded-lg text-slate-400 hover:text-pink-500 dark:hover:text-[#FFB7C5] cursor-pointer"><FiEdit2 size={14} /></button>
                    <button onClick={() => deleteCard(selected)} title="Eliminar tarjeta" className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 cursor-pointer"><FiTrash2 size={14} /></button>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#161616] border border-slate-200 dark:border-[#222] rounded-full px-2 py-1 self-start">
                    <button onClick={() => setViewMonth(m => shiftMonth(m, -1))} className="p-1.5 text-slate-500 hover:text-pink-500 cursor-pointer" aria-label="Resumen anterior"><FiChevronLeft /></button>
                    <span className="text-sm font-bold min-w-[150px] text-center">Resumen {monthLabel(viewMonth)}</span>
                    <button onClick={() => setViewMonth(m => shiftMonth(m, 1))} className="p-1.5 text-slate-500 hover:text-pink-500 cursor-pointer" aria-label="Resumen siguiente"><FiChevronRight /></button>
                  </div>
                </div>

                {!statement ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-8">No hay cuotas en este resumen.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-slate-100 dark:border-[#222] pb-5">
                      <div><span className={label}>Total ARS</span><p className="text-xl font-extrabold text-slate-900 dark:text-white">{formatMoney(statement.total_ars, "ARS")}</p></div>
                      <div><span className={label}>Total USD</span><p className="text-xl font-extrabold text-slate-900 dark:text-white">{formatMoney(statement.total_usd, "USD")}</p></div>
                      <div><span className={label}>Cierre</span><p className="text-base font-bold text-slate-700 dark:text-slate-300">{formatDay(statement.closing_date)}</p></div>
                      <div><span className={label}>Vencimiento</span><p className={`text-base font-bold ${!statement.paid && statement.due_date < todayISO() ? "text-red-500" : "text-slate-700 dark:text-slate-300"}`}>{formatDay(statement.due_date)}</p></div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {statement.items.map(item => {
                        const purchase = data.purchases.find(p => p.id === item.purchase_id);
                        return (
                          <div key={`${item.purchase_id}-${item.installment}`} className="flex items-center justify-between gap-3 p-3 sm:p-4 rounded-2xl bg-slate-50 dark:bg-[#161616] border border-slate-100 dark:border-[#222]/50">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{item.description}</p>
                              <p className="text-[11px] font-semibold text-slate-400">
                                {formatDay(item.date)}{item.installments > 1 && ` · cuota ${item.installment}/${item.installments}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-sm font-extrabold text-slate-950 dark:text-white mr-2">{formatMoney(item.amount, item.currency)}</span>
                              {purchase && (
                                <button onClick={() => openPurchaseForm(purchase)} title="Editar compra" className="p-1.5 rounded-lg text-slate-400 hover:text-pink-500 dark:hover:text-[#FFB7C5] cursor-pointer"><FiEdit2 size={14} /></button>
                              )}
                              <button onClick={() => deletePurchase(item.purchase_id, item.description)} title="Eliminar compra" className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 cursor-pointer"><FiTrash2 size={14} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button onClick={() => togglePaid(statement)}
                      className={`self-start flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all cursor-pointer ${statement.paid ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border border-slate-200 dark:border-[#222] text-slate-600 dark:text-slate-300 hover:border-emerald-300"}`}>
                      <FiCheck /> {statement.paid ? "Resumen pagado (tocar para desmarcar)" : "Marcar resumen como pagado"}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal tarjeta */}
      {cardForm && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex justify-center items-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) setCardForm(null); }}>
          <div className="bg-white dark:bg-[#111] rounded-[2.5rem] border border-slate-200 dark:border-[#222] max-w-md w-full p-8 shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">{cardForm.editing ? "Editar tarjeta" : "Nueva tarjeta"}</h2>
              <button onClick={() => setCardForm(null)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl cursor-pointer"><FiX className="text-xl" /></button>
            </div>
            <form onSubmit={submitCard} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2"><label className={label}>Nombre</label><input required value={cName} onChange={e => setCName(e.target.value)} placeholder="Visa" className={input} /></div>
                <div className="flex flex-col gap-2"><label className={label}>Banco</label><input value={cBank} onChange={e => setCBank(e.target.value)} placeholder="Galicia" className={input} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2"><label className={label}>Día de cierre</label><input required type="number" min={1} max={31} value={cClosing} onChange={e => setCClosing(e.target.value)} className={input} inputMode="numeric" /></div>
                <div className="flex flex-col gap-2"><label className={label}>Día de vencimiento</label><input required type="number" min={1} max={31} value={cDue} onChange={e => setCDue(e.target.value)} className={input} inputMode="numeric" /></div>
              </div>
              <div className="flex flex-col gap-2">
                <label className={label}>Límite en ARS (opcional)</label>
                <input type="number" min={0} step="any" value={cLimit} onChange={e => setCLimit(e.target.value)} placeholder="Ej: 1500000" className={input} inputMode="decimal" />
              </div>
              <div className="flex flex-col gap-2">
                <label className={label}>Color</label>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(CARD_COLORS).map(([key, { label: name, cls }]) => (
                    <button key={key} type="button" onClick={() => setCColor(key)} title={name}
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cls} cursor-pointer transition-all ${cColor === key ? "ring-4 ring-pink-300 dark:ring-[#FFB7C5]/70 scale-110" : ""}`} />
                  ))}
                </div>
              </div>
              {formError && <p className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 rounded-xl px-3 py-2">{formError}</p>}
              <button type="submit" disabled={saving} className={`w-full mt-2 py-3.5 text-sm ${primaryBtn}`}>{saving ? "Guardando…" : cardForm.editing ? "Guardar cambios" : "Agregar tarjeta"}</button>
              {cardForm.editing && (
                <button type="button" onClick={() => { const c = cardForm.editing!; setCardForm(null); deleteCard(c); }}
                  className="w-full py-2.5 text-sm font-bold text-slate-400 hover:text-red-500 transition-colors cursor-pointer">
                  Eliminar tarjeta
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Modal compra */}
      {purchaseForm && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex justify-center items-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) setPurchaseForm(null); }}>
          <div className="bg-white dark:bg-[#111] rounded-[2.5rem] border border-slate-200 dark:border-[#222] max-w-md w-full p-8 shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">{purchaseForm.editing ? "Editar compra" : "Nueva compra"}</h2>
              <button onClick={() => setPurchaseForm(null)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl cursor-pointer"><FiX className="text-xl" /></button>
            </div>
            <form onSubmit={submitPurchase} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className={label}>Tarjeta</label>
                <select value={pCard} onChange={e => setPCard(e.target.value)} className={`${input} cursor-pointer`}>
                  {data.cards.map(c => <option key={c.id} value={c.id}>{c.name}{c.bank ? ` · ${c.bank}` : ""}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-2"><label className={label}>Descripción</label><input required value={pDesc} onChange={e => setPDesc(e.target.value)} placeholder="Ej: Zapatillas" className={input} /></div>
              <div className="flex flex-col gap-2">
                <label className={label}>Monto total</label>
                <input required type="number" step="any" min="0.01" value={pAmount} onChange={e => setPAmount(e.target.value)} placeholder="0" className={`${input} text-right`} inputMode="decimal" />
                <div className="flex bg-slate-100 dark:bg-[#161616] rounded-xl p-1 border border-slate-200 dark:border-[#222]">
                  {(["ARS", "USD"] as CardCurrency[]).map(cur => (
                    <button key={cur} type="button" onClick={() => setPCurrency(cur)}
                      className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${pCurrency === cur ? "bg-white dark:bg-[#222] text-pink-500 dark:text-[#FFB7C5] shadow-sm" : "text-slate-500"}`}>{cur}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2"><label className={label}>Fecha de compra</label><input required type="date" value={pDate} onChange={e => setPDate(e.target.value)} className={`${input} cursor-pointer`} /></div>
                <div className="flex flex-col gap-2"><label className={label}>Cuotas</label><input required type="number" min={1} max={60} value={pInstallments} onChange={e => setPInstallments(e.target.value)} className={`${input} text-right`} inputMode="numeric" /></div>
              </div>
              {purchaseCard && pDate && (() => {
                // Resumen automático según la fecha, o el elegido a mano
                const auto = firstStatementMonth(pDate, purchaseCard.closing_day);
                const first = pStatement || auto;
                const options = Array.from({ length: 6 }, (_, i) => shiftMonth(auto, i - 2));
                if (pStatement && !options.includes(pStatement)) options.push(pStatement);
                const dueLabel = (m: string) => `${monthLabel(m)} · vence ${formatDay(statementDates(purchaseCard, m).due)}`;
                return (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className={label}>Resumen donde se paga{instN > 1 ? " (1ª cuota)" : ""}</label>
                      <select value={pStatement} onChange={e => setPStatement(e.target.value)} className={`${input} cursor-pointer`}>
                        <option value="">Automático: {dueLabel(auto)}</option>
                        {options.filter(m => m !== auto).map(m => <option key={m} value={m}>{dueLabel(m)}</option>)}
                      </select>
                      <span className="text-[11px] text-slate-400">
                        Según la fecha de compra y el cierre del día {purchaseCard.closing_day}. Cámbialo si ya sabes en qué resumen lo pagas.
                      </span>
                    </div>
                    {amountN > 0 && (
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#161616] rounded-xl px-3 py-2">
                        {instN > 1 ? `${instN} cuotas de ${formatMoney(amountN / instN, pCurrency)}` : `Un pago de ${formatMoney(amountN, pCurrency)}`} · {instN > 1 ? "primera en el" : "en el"} resumen de {dueLabel(first)}
                      </p>
                    )}
                  </>
                );
              })()}
              {formError && <p className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 rounded-xl px-3 py-2">{formError}</p>}
              <button type="submit" disabled={saving} className={`w-full mt-2 py-3.5 text-sm ${primaryBtn}`}>{saving ? "Guardando…" : purchaseForm.editing ? "Guardar cambios" : "Agregar compra"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
