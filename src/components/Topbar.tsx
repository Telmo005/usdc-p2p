'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { signOut } from '@/app/login/actions';
import { markAllNotificationsRead } from '@/app/actions/notifications';
import type { AppNotification } from '@/lib/db';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.round(hours / 24)}d`;
}

function NotificationsBell({ unreadCount, notifications }: { unreadCount: number; notifications: AppNotification[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-surface-raised"
        aria-label="Notificações"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-lg border border-border bg-surface-raised shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Notificações</span>
            {unreadCount > 0 && (
              <form action={markAllNotificationsRead}>
                <button type="submit" className="text-xs text-accent hover:underline">
                  Marcar tudo como lido
                </button>
              </form>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">Sem notificações ainda.</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`border-b border-border px-3 py-2.5 last:border-0 ${n.read_at ? '' : 'bg-accent/5'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="shrink-0 text-[10px] text-muted">{timeAgo(n.created_at)}</span>
                  </div>
                  {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar({
  fullName,
  referenceCurrency,
  unreadCount,
  notifications,
}: {
  fullName: string | null;
  referenceCurrency: string;
  unreadCount: number;
  notifications: AppNotification[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-3">
      <div className="text-sm text-muted">
        Moeda de referência: <span className="font-medium text-foreground">{referenceCurrency}</span>
      </div>
      <div className="flex items-center gap-3">
        <NotificationsBell unreadCount={unreadCount} notifications={notifications} />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-raised"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
              {(fullName ?? '?').charAt(0).toUpperCase()}
            </span>
            {fullName ?? 'Utilizador'}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border bg-surface-raised py-1 text-sm shadow-lg">
              <form action={signOut}>
                <button type="submit" className="w-full px-3 py-2 text-left text-negative hover:bg-surface">
                  Terminar sessão
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
