'use client';

import { useActionState, useState } from 'react';
import { Bell, BellOff, Trash2 } from 'lucide-react';
import { createAlertAction, toggleAlertAction, deleteAlertAction, type AlertActionState } from '@/app/actions/alerts';
import type { Alert } from '@/lib/alerts';

type Pair = { asset: string; fiat: string; buyPrice: number | null; sellPrice: number | null };

function describeAlert(a: Alert): string {
  const cmp = a.condition.operator === 'gte' ? '≥' : '≤';
  if (a.condition.kind === 'price') {
    const c = a.condition;
    return `${c.asset}/${c.fiat} (${c.side === 'buy' ? 'compra' : 'venda'}) ${cmp} ${c.threshold}`;
  }
  return `Ciclo MZN⇄ZAR ${cmp} ${a.condition.threshold}%`;
}

function CreateAlertForm({ pairs }: { pairs: Pair[] }) {
  const [state, action, pending] = useActionState<AlertActionState, FormData>(createAlertAction, undefined);
  const [kind, setKind] = useState<'price' | 'cycle'>('price');
  const [pairIdx, setPairIdx] = useState(0);
  const pair = pairs[pairIdx];

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setKind('price')}
          className={`rounded-full border px-3 py-1.5 text-xs ${kind === 'price' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'}`}
        >
          Preço de um par
        </button>
        <button
          type="button"
          onClick={() => setKind('cycle')}
          className={`rounded-full border px-3 py-1.5 text-xs ${kind === 'cycle' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'}`}
        >
          Ciclo de arbitragem MZN⇄ZAR
        </button>
      </div>
      <input type="hidden" name="kind" value={kind} />

      {kind === 'price' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted">Par</span>
            <select
              value={pairIdx}
              onChange={(e) => setPairIdx(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
            >
              {pairs.map((p, i) => (
                <option key={`${p.asset}-${p.fiat}`} value={i}>
                  {p.asset}/{p.fiat}
                </option>
              ))}
            </select>
            <input type="hidden" name="asset" value={pair?.asset ?? 'USDT'} />
            <input type="hidden" name="fiat" value={pair?.fiat ?? ''} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted">Lado</span>
            <select name="side" className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent">
              <option value="sell">Venda</option>
              <option value="buy">Compra</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted">Condição</span>
            <select name="operator" className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent">
              <option value="gte">≥ maior ou igual a</option>
              <option value="lte">≤ menor ou igual a</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted">Valor ({pair?.fiat ?? '-'})</span>
            <input
              name="threshold"
              type="number"
              step="any"
              required
              defaultValue={pair?.sellPrice?.toFixed(2) ?? ''}
              className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          {pair && (
            <p className="col-span-2 text-xs text-muted sm:col-span-4">
              Preço atual: compra {pair.buyPrice?.toFixed(2) ?? '-'} · venda {pair.sellPrice?.toFixed(2) ?? '-'} {pair.fiat}
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted">Condição</span>
            <select name="operator" className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent">
              <option value="gte">≥ maior ou igual a</option>
              <option value="lte">≤ menor ou igual a</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted">Eficiência do ciclo (%)</span>
            <input
              name="threshold"
              type="number"
              step="any"
              required
              defaultValue="0"
              className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <p className="col-span-2 text-xs text-muted sm:col-span-4">
            0% = avisa assim que ida e volta (MZN→USDT→ZAR→USDT→MZN) deixar de dar prejuízo - uma janela real de arbitragem.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60">
          {pending ? 'A criar...' : 'Criar alerta'}
        </button>
        {state?.error && <p className="text-sm text-negative">{state.error}</p>}
        {state?.success && <p className="text-sm text-positive">{state.success}</p>}
      </div>
    </form>
  );
}

export function AlertsPanel({ alerts, pairs }: { alerts: Alert[]; pairs: Pair[] }) {
  return (
    <div className="flex flex-col gap-4">
      <CreateAlertForm pairs={pairs} />

      {alerts.length === 0 ? (
        <p className="text-sm text-muted">Ainda sem alertas criados.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {alerts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center gap-2">
                {a.active ? (
                  <span className={a.is_triggered ? 'text-accent' : 'text-muted'}>
                    <Bell size={15} />
                  </span>
                ) : (
                  <span className="text-muted">
                    <BellOff size={15} />
                  </span>
                )}
                <div>
                  <div className={a.active ? '' : 'text-muted line-through'}>{describeAlert(a)}</div>
                  <div className="text-[11px] text-muted">
                    {a.is_triggered && a.active ? 'condição ativa agora' : a.last_triggered_at ? `último disparo: ${new Date(a.last_triggered_at).toLocaleString('pt-PT')}` : 'ainda não disparou'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <form action={toggleAlertAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="active" value={String(!a.active)} />
                  <button type="submit" className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground">
                    {a.active ? 'Desativar' : 'Ativar'}
                  </button>
                </form>
                <form action={deleteAlertAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="rounded-lg border border-border p-1.5 text-negative hover:bg-negative/10" aria-label="Eliminar alerta">
                    <Trash2 size={13} />
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
