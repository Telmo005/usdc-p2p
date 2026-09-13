'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-negative/10 text-negative">
        <AlertTriangle size={22} />
      </span>
      <div>
        <h2 className="text-lg font-semibold">Algo correu mal</h2>
        <p className="mt-1 text-sm text-muted">{error.message || 'Erro inesperado ao carregar esta página.'}</p>
      </div>
      <button type="button" onClick={reset} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
        Tentar novamente
      </button>
    </div>
  );
}
