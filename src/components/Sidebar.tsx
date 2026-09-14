'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/components/navItems';
import { formatAge, getFreshness } from '@/lib/dataQuality';

// Orders sync is manually/periodically triggered, not a live feed - a much
// more generous cadence than the default (market-tick oriented) thresholds.
const ORDERS_SYNC_THRESHOLDS = { delayedAfterMs: 2 * 3600_000, staleAfterMs: 24 * 3600_000 };

export function Sidebar({
  connectionOk,
  lastSyncedAt,
}: {
  connectionOk: boolean;
  lastSyncedAt: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="px-5 py-5">
        <span className="text-lg font-bold">
          P2P <span className="text-accent">Manager</span>
        </span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition ${
                active ? 'bg-accent/10 font-medium text-accent' : 'text-muted hover:bg-surface-raised hover:text-foreground'
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${active ? 'bg-accent/15' : 'bg-surface-raised'}`}>
                <Icon size={15} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-4 py-4 text-xs text-muted">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${connectionOk ? 'bg-positive' : 'bg-negative'}`} />
          {connectionOk ? 'Binance conectada' : 'Binance desconectada'}
        </div>
        <div className="mt-1">
          {lastSyncedAt
            ? `Última sinc.: ${formatAge(lastSyncedAt)}${
                getFreshness(lastSyncedAt, ORDERS_SYNC_THRESHOLDS) === 'stale' ? ' (desatualizada)' : ''
              }`
            : 'Ainda sem sincronização'}
        </div>
      </div>
    </aside>
  );
}
