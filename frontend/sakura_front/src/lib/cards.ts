// Tipos y cálculos de tarjetas compartidos por Tarjetas, Dashboard y Planificación.
// Los resúmenes (qué cuota cae en qué mes) los calcula el backend.

export type CardCurrency = "ARS" | "USD";

export interface CreditCard {
  id: string;
  name: string;
  bank: string;
  closing_day: number;
  due_day: number;
  limit: number | null;
  color: string;
  paid_statements: string[];
}

export interface CardPurchase {
  id: string;
  card_id: string;
  description: string;
  amount: number;
  currency: CardCurrency;
  date: string;
  installments: number;
  statement_month?: string | null; // primer resumen elegido a mano (null = según la fecha)
}

export interface StatementItem {
  purchase_id: string;
  description: string;
  date: string;
  installment: number;
  installments: number;
  amount: number;
  currency: CardCurrency;
}

export interface Statement {
  card_id: string;
  month: string; // YYYY-MM en que cierra
  closing_date: string;
  due_date: string;
  total_ars: number;
  total_usd: number;
  paid: boolean;
  items: StatementItem[];
}

export interface CardsData {
  cards: CreditCard[];
  purchases: CardPurchase[];
  statements: Statement[];
}

type Rates = Partial<Record<"ARS" | "USD" | "EUR", number>>;

/** Total de un resumen en ARS (USD convertido con la cotización actual). */
export function statementARS(st: Statement, rates: Rates): number {
  return st.total_ars + st.total_usd * (rates.USD || 1);
}

/** Total en ARS de las cuotas de un mes (resúmenes que cierran ese mes), todas las tarjetas. */
export function monthCardsARS(statements: Statement[], month: string, rates: Rates): number {
  return statements.filter(s => s.month === month).reduce((sum, s) => sum + statementARS(s, rates), 0);
}

const today = () => new Date().toISOString().split("T")[0];

/** Próximo resumen a pagar de cada tarjeta: el primero no pagado que todavía no venció. */
export function nextStatements(statements: Statement[]): Statement[] {
  const t = today();
  const byCard = new Map<string, Statement>();
  for (const s of [...statements].sort((a, b) => a.month.localeCompare(b.month))) {
    if (s.paid || s.due_date < t || byCard.has(s.card_id)) continue;
    byCard.set(s.card_id, s);
  }
  return [...byCard.values()];
}

/** Resúmenes vencidos sin marcar como pagados. */
export function overdueStatements(statements: Statement[]): Statement[] {
  const t = today();
  return statements.filter(s => !s.paid && s.due_date < t);
}

/** Lo que falta pagar de una tarjeta (resúmenes no pagados), en ARS: para comparar con el límite. */
export function cardDebtARS(statements: Statement[], cardId: string, rates: Rates): number {
  return statements
    .filter(s => s.card_id === cardId && !s.paid)
    .reduce((sum, s) => sum + statementARS(s, rates), 0);
}

/** Mes (YYYY-MM) del primer resumen de una compra, igual que el backend. */
export function firstStatementMonth(purchaseDate: string, closingDay: number): string {
  const [y, m, d] = purchaseDate.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const close = Math.min(closingDay, lastDay);
  const date = d <= close ? new Date(y, m - 1, 1) : new Date(y, m, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const clampDay = (y: number, m: number, day: number) => new Date(y, m - 1, Math.min(day, new Date(y, m, 0).getDate()));
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Fechas de cierre y vencimiento del resumen de un mes (misma regla que el backend). */
export function statementDates(card: Pick<CreditCard, "closing_day" | "due_day">, month: string) {
  const [y, m] = month.split("-").map(Number);
  const closing = clampDay(y, m, card.closing_day);
  const due = card.due_day > card.closing_day ? clampDay(y, m, card.due_day) : clampDay(y, m + 1, card.due_day);
  return { closing: toISO(closing), due: toISO(due) };
}

export function monthLabel(month: string, opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }): string {
  const [y, m] = month.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es-AR", opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(currency === "ARS" ? "es-AR" : "en-US", {
    style: "currency", currency, minimumFractionDigits: currency === "ARS" ? 0 : 2, maximumFractionDigits: 2,
  }).format(amount);
}

// Estilos de las tarjetas (gradientes)
export const CARD_COLORS: Record<string, { label: string; cls: string }> = {
  pink: { label: "Sakura", cls: "from-pink-400 via-rose-400 to-fuchsia-500" },
  violet: { label: "Violeta", cls: "from-violet-500 via-purple-500 to-indigo-600" },
  blue: { label: "Azul", cls: "from-sky-500 via-blue-500 to-indigo-600" },
  emerald: { label: "Verde", cls: "from-emerald-400 via-teal-500 to-cyan-600" },
  amber: { label: "Oro", cls: "from-amber-400 via-orange-400 to-rose-500" },
  slate: { label: "Black", cls: "from-slate-700 via-slate-800 to-black" },
};

export const cardGradient = (color: string) => (CARD_COLORS[color] ?? CARD_COLORS.pink).cls;
