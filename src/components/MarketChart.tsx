'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MarketSeries } from '@/lib/db';

const RANGES = [
  { label: '1h', ms: 3600_000 },
  { label: '6h', ms: 6 * 3600_000 },
  { label: '24h', ms: 24 * 3600_000 },
  { label: '7d', ms: 7 * 24 * 3600_000 },
  { label: 'Tudo', ms: Infinity },
] as const;

function TrendBadge({ trend }: { trend: 'up' | 'down' | null }) {
  if (!trend) return <span className="text-xs text-muted">a recolher dados</span>;
  return trend === 'up' ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-positive">▲ a subir</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-negative">▼ a descer</span>
  );
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function seriesStats(values: number[]) {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const first = values[0];
  const last = values[values.length - 1];
  const pct = first === 0 ? 0 : ((last - first) / first) * 100;
  return { min, max, last, pct };
}

function StatBlock({ label, color, stats, fiat }: { label: string; color: string; stats: ReturnType<typeof seriesStats>; fiat: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      {stats ? (
        <>
          <span className="font-mono text-sm font-bold" style={{ color }}>
            {stats.last.toFixed(2)} {fiat}
          </span>
          <span className="text-[11px] text-muted">
            mín {stats.min.toFixed(2)} · máx {stats.max.toFixed(2)} ·{' '}
            <span className={stats.pct >= 0 ? 'text-positive' : 'text-negative'}>
              {stats.pct >= 0 ? '+' : ''}
              {stats.pct.toFixed(2)}%
            </span>
          </span>
        </>
      ) : (
        <span className="text-xs text-muted">sem dados neste período</span>
      )}
    </div>
  );
}

export function MarketChart({ series }: { series: MarketSeries }) {
  const [rangeIdx, setRangeIdx] = useState(2); // default 24h

  const range = RANGES[rangeIdx];
  const cutoff = Number.isFinite(range.ms) ? Date.now() - range.ms : 0;

  const ticks = useMemo(() => series.ticks.filter((p) => p.t >= cutoff), [series.ticks, cutoff]);
  const reversals = useMemo(() => series.reversals.filter((r) => r.t >= cutoff), [series.reversals, cutoff]);

  const buyStats = seriesStats(ticks.map((p) => p.buy).filter((v): v is number => v != null));
  const sellStats = seriesStats(ticks.map((p) => p.sell).filter((v): v is number => v != null));
  const spread = series.lastSell != null && series.lastBuy != null ? series.lastSell - series.lastBuy : null;
  const spreadPct = spread != null && series.lastBuy ? (spread / series.lastBuy) * 100 : null;

  const gradCompra = `gradCompra-${series.asset}-${series.fiat}`;
  const gradVenda = `gradVenda-${series.asset}-${series.fiat}`;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">
            {series.asset}/{series.fiat}
          </h3>
          <p className="text-xs text-muted">Anúncios P2P reais (Binance) · média dos 5 melhores por lado</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">Compra</span>
            <span className="font-mono font-semibold text-info">{series.lastBuy?.toFixed(2) ?? '-'}</span>
            <TrendBadge trend={series.buyTrend} />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">Venda</span>
            <span className="font-mono font-semibold text-positive">{series.lastSell?.toFixed(2) ?? '-'}</span>
            <TrendBadge trend={series.sellTrend} />
          </div>
          {spread != null && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted">Spread</span>
              <span className="font-mono font-semibold text-accent">
                {spread.toFixed(2)} ({spreadPct!.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            type="button"
            onClick={() => setRangeIdx(i)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              i === rangeIdx ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <StatBlock label="Compra" color="var(--info)" stats={buyStats} fiat={series.fiat} />
        <StatBlock label="Venda" color="var(--positive)" stats={sellStats} fiat={series.fiat} />
      </div>

      {ticks.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Ainda sem histórico neste período. Os pontos aparecem à medida que a sincronização de mercado corre (ver README →
          cron de mercado).
        </p>
      ) : (
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ticks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradCompra} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--info)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--info)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={gradVenda} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--positive)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--positive)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v) => fmtTime(v)}
                stroke="var(--muted)"
                fontSize={11}
                minTickGap={50}
              />
              <YAxis domain={['auto', 'auto']} stroke="var(--muted)" fontSize={11} width={58} tickFormatter={(v) => Number(v).toFixed(2)} />
              <Tooltip
                contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v) => fmtTime(v as number)}
                formatter={(value, name) => [`${Number(value).toFixed(2)} ${series.fiat}`, String(name)]}
              />
              <Area
                type="linear"
                dataKey="buy"
                name="Compra"
                stroke="var(--info)"
                strokeWidth={2.5}
                fill={`url(#${gradCompra})`}
                connectNulls
                dot={{ r: 4, fill: 'var(--info)', strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
              <Area
                type="linear"
                dataKey="sell"
                name="Venda"
                stroke="var(--positive)"
                strokeWidth={2.5}
                fill={`url(#${gradVenda})`}
                connectNulls
                dot={{ r: 4, fill: 'var(--positive)', strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
              {reversals.map((r, i) => (
                <ReferenceDot
                  key={i}
                  x={r.t}
                  y={r.toPrice}
                  r={5}
                  fill={r.newTrend === 'up' ? 'var(--positive)' : 'var(--negative)'}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  label={{
                    value: r.newTrend === 'up' ? 'mín.' : 'máx.',
                    position: r.newTrend === 'up' ? 'bottom' : 'top',
                    fontSize: 10,
                    fill: r.newTrend === 'up' ? 'var(--positive)' : 'var(--negative)',
                  }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {reversals.length > 0 && (
        <p className="mt-2 text-[11px] text-muted">
          ● pontos marcados = reversões de tendência já confirmadas (mínimos/máximos locais reais, detetados após 2 leituras seguidas na
          nova direção).
        </p>
      )}
    </div>
  );
}
