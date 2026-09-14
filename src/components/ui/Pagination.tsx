/**
 * Plain-link pagination (no client JS needed - same "navigate with a new
 * query param" convention analytics/research already use for their own
 * filters). Compact: always shows first/last, the current page ± 1, and
 * "…" for any gap - never a wall of page numbers for a long list.
 */
export function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const pages = new Set<number>([1, totalPages]);
  for (let p = page - 1; p <= page + 1; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
      {page > 1 ? (
        <a href={buildHref(page - 1)} className="rounded-lg border border-border px-3 py-1.5 text-muted hover:border-accent hover:text-foreground">
          ← Anterior
        </a>
      ) : (
        <span className="rounded-lg border border-border px-3 py-1.5 text-muted opacity-40">← Anterior</span>
      )}

      <div className="flex items-center gap-1">
        {sorted.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && sorted[i - 1] !== p - 1 && <span className="px-1 text-muted">…</span>}
            <a
              href={buildHref(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`min-w-[1.75rem] rounded-lg border px-2.5 py-1 text-center ${
                p === page ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'
              }`}
            >
              {p}
            </a>
          </span>
        ))}
      </div>

      {page < totalPages ? (
        <a href={buildHref(page + 1)} className="rounded-lg border border-border px-3 py-1.5 text-muted hover:border-accent hover:text-foreground">
          Seguinte →
        </a>
      ) : (
        <span className="rounded-lg border border-border px-3 py-1.5 text-muted opacity-40">Seguinte →</span>
      )}
    </div>
  );
}
