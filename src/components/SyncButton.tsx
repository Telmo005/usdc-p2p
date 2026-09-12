'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SyncButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha desconhecida.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível sincronizar. Tenta novamente.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleSync}
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition disabled:opacity-60"
      >
        {pending ? 'A sincronizar...' : '🔄 Sincronizar agora'}
      </button>
      {error && <p className="max-w-xs text-right text-xs text-negative">{error}</p>}
    </div>
  );
}
