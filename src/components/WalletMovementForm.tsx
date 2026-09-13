'use client';

import { useActionState, useState } from 'react';
import { addWalletMovementAction, type WalletActionState } from '@/app/actions/wallet';

const TYPE_OPTIONS = [
  { value: 'deposit', label: 'Depósito' },
  { value: 'withdrawal', label: 'Levantamento' },
  { value: 'adjustment', label: 'Ajuste (correção)' },
] as const;

export function WalletMovementForm() {
  const [state, action, pending] = useActionState<WalletActionState, FormData>(addWalletMovementAction, undefined);
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]['value']>('deposit');

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setType(opt.value)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              type === opt.value ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <input type="hidden" name="type" value={type} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">Ativo</span>
          <input name="asset" defaultValue="USDT" required className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">{type === 'adjustment' ? 'Valor (+ ou -)' : 'Valor'}</span>
          <input
            name="amount"
            type="number"
            step="any"
            required
            className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 text-sm sm:col-span-1">
          <span className="text-xs text-muted">Notas</span>
          <input name="notes" className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent" />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60">
          {pending ? 'A registar...' : 'Registar movimento'}
        </button>
        {state?.error && <p className="text-sm text-negative">{state.error}</p>}
        {state?.success && <p className="text-sm text-positive">{state.success}</p>}
      </div>
    </form>
  );
}
