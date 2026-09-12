'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Início', icon: '🏠' },
  { href: '/orders', label: 'Ordens', icon: '📋' },
  { href: '/ads', label: 'Anúncios', icon: '📣' },
  { href: '/wallet', label: 'Carteira', icon: '💰' },
  { href: '/analytics', label: 'Análise', icon: '📊' },
  { href: '/customers', label: 'Clientes', icon: '👥' },
  { href: '/settings', label: 'Configurações', icon: '⚙️' },
];

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
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
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
        <div className="mt-1">{lastSyncedAt ? `Última sinc.: ${new Date(lastSyncedAt).toLocaleString('pt-PT')}` : 'Ainda sem sincronização'}</div>
      </div>
    </aside>
  );
}
