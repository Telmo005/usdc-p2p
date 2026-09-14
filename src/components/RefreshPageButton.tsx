'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * For the server-rendered data on a page that has no client-side state to
 * lose (no picker, no in-progress form) - router.refresh() re-runs the
 * page's own server-side data fetching and re-renders with fresh props,
 * without a hard navigation. For the live per-ad book inside
 * MultiAdSimulator/AdsBrowser, which DO have state worth preserving, see
 * their own dedicated refresh buttons instead - this one is for everything
 * else on a page.
 */
export function RefreshPageButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-60"
    >
      <RefreshCw size={13} className={isPending ? 'animate-spin' : ''} /> {isPending ? 'A atualizar...' : 'Atualizar página'}
    </button>
  );
}
