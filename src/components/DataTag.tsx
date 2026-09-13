import { DATA_SOURCE_CONFIG, formatAge, type DataSource } from '@/lib/dataQuality';

/** The badge sibling of StatusBadge (src/components/StatusBadge.tsx) - same
 *  pill shape, but tags a number's origin (real/calculado/estimado/manual/
 *  simulado/histórico) and, when given a timestamp, its age. */
export function DataTag({
  source,
  fetchedAt,
  label,
}: {
  source: DataSource;
  fetchedAt?: number | string | null;
  label?: string;
}) {
  const config = DATA_SOURCE_CONFIG[source];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs"
      title={config.label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {label ?? config.badge}
      {fetchedAt != null && <span className="text-muted">· {formatAge(fetchedAt)}</span>}
    </span>
  );
}
