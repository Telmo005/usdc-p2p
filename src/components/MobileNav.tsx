'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { NAV_ITEMS } from '@/components/navItems';
import { formatAge, getFreshness } from '@/lib/dataQuality';

const ORDERS_SYNC_THRESHOLDS = { delayedAfterMs: 2 * 3600_000, staleAfterMs: 24 * 3600_000 };

export function MobileNav({ connectionOk, lastSyncedAt }: { connectionOk: boolean; lastSyncedAt: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Closing on route change covers both link taps inside the drawer and any
  // other navigation (back button, etc.) while it happened to be open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-surface-raised md:hidden"
      >
        <Menu size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-surface">
            <div className="flex items-center justify-between px-5 py-5">
              <span className="text-lg font-bold">
                P2P <span className="text-accent">Manager</span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-surface-raised"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
              {NAV_ITEMS.map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                      active ? 'bg-accent/10 font-medium text-accent' : 'text-muted hover:bg-surface-raised hover:text-foreground'
                    }`}
                  >
                    <span>{item.icon}</span>
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
          </div>
        </div>
      )}
    </>
  );
}
