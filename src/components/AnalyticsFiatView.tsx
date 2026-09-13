'use client';

import { useState } from 'react';
import { StatCard } from '@/components/StatCard';
import { AnalyticsChart } from '@/components/AnalyticsChart';
import type { AnalyticsData } from '@/lib/analytics';

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { minimumFractionDigits: maxFrac, maximumFractionDigits: maxFrac });
}

export function AnalyticsFiatView({ data }: { data: AnalyticsData }) {
  const [fiatIdx, setFiatIdx] = useState(0);
  const fiat = data.fiats[fiatIdx];

  if (data.fiats.length === 0) return null;

  return (
    <div>
      {data.fiats.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {data.fiats.map((f, i) => (
            <button
              key={f.fiat}
              type="button"
              onClick={() => setFiatIdx(i)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                i === fiatIdx ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'
              }`}
            >
              {f.fiat}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Volume comprado" value={`${fmt(fiat.buyVolume)} ${fiat.fiat}`} sub={`${fiat.buyCount} ordens`} />
        <StatCard label="Volume vendido" value={`${fmt(fiat.sellVolume)} ${fiat.fiat}`} sub={`${fiat.sellCount} ordens`} />
        <StatCard
          label="Lucro bruto"
          value={`${fiat.grossProfit >= 0 ? '+' : ''}${fmt(fiat.grossProfit)} ${fiat.fiat}`}
          tone={fiat.grossProfit >= 0 ? 'positive' : 'negative'}
        />
        <StatCard
          label="Margem"
          value={`${fiat.marginPct >= 0 ? '+' : ''}${fiat.marginPct.toFixed(2)}%`}
          tone={fiat.marginPct >= 0 ? 'positive' : 'negative'}
          sub="lucro ÷ volume comprado"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Preço médio de compra" value={fiat.avgBuyPrice > 0 ? `${fmt(fiat.avgBuyPrice, 4)} ${fiat.fiat}` : '—'} />
        <StatCard label="Preço médio de venda" value={fiat.avgSellPrice > 0 ? `${fmt(fiat.avgSellPrice, 4)} ${fiat.fiat}` : '—'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Ordens canceladas" value={String(fiat.cancelledCount)} />
        <StatCard
          label="Tempo médio até concluir"
          value={fiat.avgCompletionMinutes != null ? `${fmt(fiat.avgCompletionMinutes, 0)} min` : '—'}
        />
      </div>

      {fiat.byMethod.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Distribuição por método de pagamento</div>
          <div className="flex flex-col gap-1.5">
            {fiat.byMethod.map((m) => (
              <div key={m.method} className="flex items-center justify-between text-sm">
                <span className="text-muted">
                  {m.method} <span className="text-xs">({m.count} ordens)</span>
                </span>
                <span className="font-mono">
                  {fmt(m.volume)} {fiat.fiat}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <AnalyticsChart series={data.seriesByFiat[fiat.fiat] ?? []} fiat={fiat.fiat} />
      </div>
    </div>
  );
}
