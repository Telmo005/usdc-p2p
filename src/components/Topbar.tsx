'use client';

import { useState } from 'react';
import { signOut } from '@/app/login/actions';

export function Topbar({ fullName, referenceCurrency }: { fullName: string | null; referenceCurrency: string }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-3">
      <div className="text-sm text-muted">
        Moeda de referência: <span className="font-medium text-foreground">{referenceCurrency}</span>
      </div>
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
    </header>
  );
}
