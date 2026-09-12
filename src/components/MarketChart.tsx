'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MarketSeries } from '@/lib/db';

function TrendBadge({ trend }: { trend: 'up' | 'down' | null }) {
  if (!trend) return <span className="text-xs text-muted">a recolher dados</span>;
  return trend === 'up' ? (
    <span className="text-xs font-semibold text-positive">▲ a subir</span>
  ) : (
    <span className="text-xs font-semibold text-negative">▼ a descer</span>
  );
}

export function MarketChart({ series }: { series: MarketSeries }) {
  const maxLen = Math.max(series.buy.points.length, series.sell.points.length);
  const data = Array.from({ length: maxLen }).map((_, i) => ({
    t: series.buy.points[i]?.t ?? series.sell.points[i]?.t ?? null,
    compra: series.buy.points[i]?.price ?? null,
    venda: series.sell.points[i]?.price ?? null,
  }));

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          {series.asset}/{series.fiat} <span className="font-normal text-muted">· anúncios P2P reais</span>
        </h3>
        <div className="flex gap-5">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">Compra</span>
            <span className="font-mono text-info">{series.buy.lastPrice?.toFixed(2) ?? '-'}</span>
            <TrendBadge trend={series.buy.trend} />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">Venda</span>
            <span className="font-mono text-positive">{series.sell.lastPrice?.toFixed(2) ?? '-'}</span>
            <TrendBadge trend={series.sell.trend} />
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Ainda sem histórico. Os pontos aparecem à medida que a sincronização de mercado corre (ver Configurações → Sincronização de mercado).
        </p>
      ) : (
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="t"
                tickFormatter={(v) => (v ? new Date(v).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '')}
                stroke="var(--muted)"
                fontSize={11}
                minTickGap={40}
              />
              <YAxis domain={['auto', 'auto']} stroke="var(--muted)" fontSize={11} width={55} />
              <Tooltip
                contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v) => (v ? new Date(v as string).toLocaleString('pt-PT') : '')}
              />
              <Line type="monotone" dataKey="compra" stroke="var(--info)" strokeWidth={2} dot={false} name="Compra" connectNulls />
              <Line type="monotone" dataKey="venda" stroke="var(--positive)" strokeWidth={2} dot={false} name="Venda" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
