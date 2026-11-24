// Placeholders animados que imitan el contenido mientras carga, en lugar de un spinner.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 dark:bg-[#1c1c1c] ${className}`} />;
}

/** Bloque tipo tarjeta con título y algunas filas. */
export function CardSkeleton({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`bg-white dark:bg-[#111] rounded-3xl border border-slate-200 dark:border-[#222] p-6 flex flex-col gap-4 ${className}`}>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-8 w-56" />
      <div className="flex flex-col gap-3 mt-2">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    </div>
  );
}

/** Página genérica: encabezado, fila de indicadores y bloques de contenido. */
export function PageSkeleton({ stats = 3, blocks = 2 }: { stats?: number; blocks?: number }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] py-8 px-4 sm:px-8" aria-busy="true" aria-label="Cargando">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        <div className="border-b border-slate-200 dark:border-[#222] pb-6 flex flex-col gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        {stats > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: stats }, (_, i) => (
              <div key={i} className="bg-white dark:bg-[#111] rounded-3xl border border-slate-200 dark:border-[#222] p-5 flex items-center gap-4">
                <Skeleton className="h-12 w-12 shrink-0" />
                <div className="flex-1 flex flex-col gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-32" />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {Array.from({ length: blocks }, (_, i) => (
            <CardSkeleton key={i} rows={i === 0 ? 4 : 3} className={i === 0 ? "lg:col-span-2" : ""} />
          ))}
        </div>
      </div>
    </div>
  );
}
