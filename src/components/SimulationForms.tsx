'use client';

import { useActionState } from 'react';
import { addLotAction, recordSaleAction, type SimActionState } from '@/app/actions/simulation';

function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  step,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs text-muted">{label}</span>
      <input
        name={name}
        type={type}
        step={step}
        defaultValue={defaultValue}
        required={required}
        className="rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
      />
    </label>
  );
}

export function AddLotForm() {
  const [state, action, pending] = useActionState<SimActionState, FormData>(addLotAction, undefined);

  return (
    <form action={action} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Field label="Ativo" name="asset" defaultValue="USDT" required />
      <Field label="Fiat" name="fiat" defaultValue="MZN" required />
      <Field label="Quantidade" name="quantity" type="number" step="any" required />
      <Field label="Preço de compra" name="buyPrice" type="number" step="any" required />
      <Field label="Taxa (fiat)" name="buyFee" type="number" step="any" defaultValue="0" />
      <Field label="Notas" name="notes" />
      <div className="col-span-2 flex items-end gap-3 sm:col-span-3 lg:col-span-6">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {pending ? 'A registar...' : 'Registar compra'}
        </button>
        {state?.error && <p className="text-sm text-negative">{state.error}</p>}
        {state?.success && <p className="text-sm text-positive">{state.success}</p>}
      </div>
    </form>
  );
}

export function RecordSaleForm() {
  const [state, action, pending] = useActionState<SimActionState, FormData>(recordSaleAction, undefined);

  return (
    <form action={action} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Field label="Ativo" name="asset" defaultValue="USDT" required />
      <Field label="Fiat" name="fiat" defaultValue="MZN" required />
      <Field label="Quantidade vendida" name="quantity" type="number" step="any" required />
      <Field label="Preço de venda" name="sellPrice" type="number" step="any" required />
      <Field label="Taxa (fiat)" name="sellFee" type="number" step="any" defaultValue="0" />
      <div className="col-span-2 flex items-end gap-3 sm:col-span-3 lg:col-span-5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-positive px-4 py-2 text-sm font-semibold text-positive disabled:opacity-60"
        >
          {pending ? 'A registar...' : 'Registar venda (FIFO)'}
        </button>
        {state?.error && <p className="text-sm text-negative">{state.error}</p>}
        {state?.success && <p className="text-sm text-positive">{state.success}</p>}
      </div>
    </form>
  );
}
