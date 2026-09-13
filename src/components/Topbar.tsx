'use client';

import { useState, useTransition } from 'react';
import { Bell } from 'lucide-react';
import { signOut } from '@/app/login/actions';
import { markAllNotificationsRead, markNotificationRead } from '@/app/actions/notifications';
import { MobileNav } from '@/components/MobileNav';
import { formatAge } from '@/lib/dataQuality';
import type { AppNotification } from '@/lib/db';

function NotificationsBell({ unreadCount, notifications }: { unreadCount: number; notifications: AppNotification[] }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

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
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.read_at) startTransition(() => markNotificationRead(n.id));
                  }}
                  className={`block w-full border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-surface ${n.read_at ? '' : 'bg-accent/5'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      {n.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted">{formatAge(n.created_at)}</span>
                  </div>
                  {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                </button>
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
  connectionOk,
  lastSyncedAt,
}: {
  fullName: string | null;
  referenceCurrency: string;
  unreadCount: number;
  notifications: AppNotification[];
  connectionOk: boolean;
  lastSyncedAt: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 md:px-5">
      <div className="flex items-center gap-3">
        <MobileNav connectionOk={connectionOk} lastSyncedAt={lastSyncedAt} />
        <div className="text-sm text-muted">
          <span className="hidden sm:inline">Moeda de referência: </span>
          <span className="font-medium text-foreground">{referenceCurrency}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <NotificationsBell unreadCount={unreadCount} notifications={notifications} />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-raised"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
              {(fullName ?? '?').charAt(0).toUpperCase()}
            </span>
            <span className="hidden max-w-[10rem] truncate sm:inline">{fullName ?? 'Utilizador'}</span>
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
