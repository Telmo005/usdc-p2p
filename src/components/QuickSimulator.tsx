'use client';

import { useMemo, useState } from 'react';
import { DataTag } from '@/components/DataTag';

type Pair = { asset: string; fiat: string; buyPrice: number | null; sellPrice: number | null };

export function QuickSimulator({ pairs }: { pairs: Pair[] }) {
  const usable = pairs.filter((p) => p.buyPrice != null && p.sellPrice != null);
  const [pairIdx, setPairIdx] = useState(0);
  const [amount, setAmount] = useState('1000');

  const pair = usable[pairIdx];
  const invest = Number(amount);

  const result = useMemo(() => {
    if (!pair || !(invest > 0)) return null;
    const qty = invest / pair.buyPrice!;
    const proceeds = qty * pair.sellPrice!;
    const profit = proceeds - invest;
    const profitPct = (profit / invest) * 100;
    return { qty, proceeds, profit, profitPct };
  }, [pair, invest]);

  if (usable.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
        Ainda sem preços de mercado suficientes para simular. Volta depois de a sincronização de mercado correr.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">Simulação rápida</h2>
      <p className="mt-1 text-xs text-muted">Quanto vais investir? Usamos os preços de compra e venda do mercado agora mesmo.</p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">Vou investir</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-40 rounded-lg border border-border bg-background px-3 py-2.5 text-lg font-semibold outline-none focus:border-accent"
            />
            <span className="text-sm text-muted">{pair.fiat}</span>
          </div>
        </label>

        {usable.length > 1 && (
          <div className="flex gap-1.5">
            {usable.map((p, i) => (
              <button
                key={`${p.asset}-${p.fiat}`}
                type="button"
                onClick={() => setPairIdx(i)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  i === pairIdx ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'
                }`}
              >
                {p.asset}/{p.fiat}
              </button>
            ))}
          </div>
        )}
      </div>

      {result && (
        <div className="mt-5 rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex justify-end">
            <DataTag source="simulated" />
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <div className="text-xs text-muted">Compras agora</div>
              <div className="font-mono text-lg font-semibold">
                {result.qty.toLocaleString('pt-PT', { maximumFractionDigits: 4 })} {pair.asset}
              </div>
              <div className="text-xs text-muted">a {pair.buyPrice!.toFixed(4)} {pair.fiat}/{pair.asset}</div>
            </div>
            <div className="text-xl text-muted">→</div>
            <div>
              <div className="text-xs text-muted">Se vendesses agora, recebias</div>
              <div className="font-mono text-lg font-semibold">
                {result.proceeds.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {pair.fiat}
              </div>
              <div className="text-xs text-muted">a {pair.sellPrice!.toFixed(4)} {pair.fiat}/{pair.asset}</div>
            </div>
            <div className="text-xl text-muted">=</div>
            <div>
              <div className="text-xs text-muted">Lucro se fizesses isto agora</div>
              <div className={`font-mono text-xl font-bold ${result.profit >= 0 ? 'text-positive' : 'text-negative'}`}>
                {result.profit >= 0 ? '+' : ''}
                {result.profit.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {pair.fiat} (
                {result.profitPct >= 0 ? '+' : ''}
                {result.profitPct.toFixed(2)}%)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
