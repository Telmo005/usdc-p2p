import { formatAge, getFreshness } from '@/lib/dataQuality';

const DOT: Record<ReturnType<typeof getFreshness>, string> = {
  live: 'bg-positive',
  delayed: 'bg-accent',
  stale: 'bg-negative',
  unknown: 'bg-muted',
};

export type SyncStatusItem = {
  label: string;
  timestamp: string | number | null;
  error?: string | null;
  thresholds?: { delayedAfterMs?: number; staleAfterMs?: number };
};

/** The "🟢 Binance conectada / última sincronização" strip for the top of a
 *  page - static at render time, same convention as the rest of this app
 *  (manual "Atualizar"/"Sincronizar" buttons via router.refresh(), no
 *  client-side polling). */
export function SyncStatusBar({ items }: { items: SyncStatusItem[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const freshness = item.error ? 'stale' : getFreshness(item.timestamp, item.thresholds);
        return (
          <div
            key={item.label}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs"
            title={item.error ?? undefined}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[freshness]}`} />
            <span className="font-medium">{item.label}</span>
            <span className="text-muted">{item.error ? 'falhou' : formatAge(item.timestamp)}</span>
          </div>
        );
      })}
    </div>
  );
}
