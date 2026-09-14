'use client';

import { useState } from 'react';
import type { BacktestRule } from '@/lib/researchLab';

type Pair = { asset: string; fiat: string };
type Kind = BacktestRule['kind'];

const KIND_LABEL: Record<Kind, string> = {
  price: 'Preço de um par',
  spread: 'Spread de um par',
  liquidity: 'Liquidez (nº de anúncios)',
  cycle: 'Ciclo de arbitragem MZN⇄ZAR',
};

/** Plain GET form (no server action, no client-side submit logic) - the
 *  browser builds the query string from these named inputs, same
 *  "navigate with new params" convention analytics/page.tsx already uses
 *  for its period selector. Only the show/hide-which-fields interaction
 *  needs client state, mirroring AlertsPanel.tsx's CreateAlertForm. */
export function ResearchRuleForm({
  pairs,
  initial,
}: {
  pairs: Pair[];
  initial: { kind: Kind; asset: string; fiat: string; side: 'buy' | 'sell'; operator: 'gte' | 'lte'; threshold: number; days: number };
}) {
  const [kind, setKind] = useState<Kind>(initial.kind);
  const needsPair = kind === 'price' || kind === 'spread' || kind === 'liquidity';
  const needsSide = kind === 'price' || kind === 'liquidity';

  return (
    <form method="get" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1.5 text-xs ${kind === k ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'}`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {needsPair && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted">Par</span>
            <select name="fiat" defaultValue={initial.fiat} className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent">
              {pairs.map((p) => (
                <option key={p.fiat} value={p.fiat}>
                  {p.asset}/{p.fiat}
                </option>
              ))}
            </select>
            <input type="hidden" name="asset" value="USDT" />
          </label>
        )}
        {needsSide && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted">Lado</span>
            <select name="side" defaultValue={initial.side} className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent">
              <option value="sell">Venda</option>
              <option value="buy">Compra</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">Condição</span>
          <select name="operator" defaultValue={initial.operator} className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent">
            <option value="gte">≥ maior ou igual a</option>
            <option value="lte">≤ menor ou igual a</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">
            {kind === 'price' && 'Valor'}
            {kind === 'spread' && 'Spread (%)'}
            {kind === 'liquidity' && 'Nº de anúncios'}
            {kind === 'cycle' && 'Eficiência do ciclo (%)'}
          </span>
          <input
            name="threshold"
            type="number"
            step="any"
            defaultValue={initial.threshold}
            className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">Período</span>
          <select name="days" defaultValue={initial.days} className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent">
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
            <option value={365}>Tudo (até 1 ano)</option>
          </select>
        </label>
      </div>

      <button type="submit" className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
        Simular histórico
      </button>
    </form>
  );
}
