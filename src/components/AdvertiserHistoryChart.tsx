'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AdvertiserHistorySeries } from '@/lib/advertiserHistory';

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * One real advertiser's own price over time - deliberately simpler than
 * MarketChart.tsx (one line, no range selector, no reversal dots): this is
 * a compact card on the Favoritos page, not a dedicated analysis view.
 * Same recharts/color-token conventions as MarketChart for visual
 * consistency. No backfill exists (lib/advertiserHistory.ts) - fewer than
 * 2 points can't show an "evolução," so that's said plainly instead of
 * rendering a misleading single-dot chart.
 */
export function AdvertiserHistoryChart({ series }: { series: AdvertiserHistorySeries }) {
  const color = series.side === 'buy' ? 'var(--info)' : 'var(--positive)';
  const gradId = `gradAdvHist-${series.asset}-${series.fiat}-${series.side}`;

  if (series.points.length < 2) {
    return (
      <div className="rounded-lg border border-border p-3 text-xs text-muted">
        {series.asset}/{series.fiat} · {series.side === 'buy' ? 'a vender' : 'a comprar'} - histórico ainda curto, vai crescendo a
        cada sincronização.
      </div>
    );
  }

  const first = series.points[0].price;
  const last = series.points[series.points.length - 1].price;
  const pct = first !== 0 ? ((last - first) / first) * 100 : 0;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium">
          {series.asset}/{series.fiat} · {series.side === 'buy' ? 'a vender' : 'a comprar'}
        </span>
        <span className="font-mono">
          {last.toFixed(4)} {series.fiat}{' '}
          <span className={pct >= 0 ? 'text-positive' : 'text-negative'}>
            ({pct >= 0 ? '+' : ''}
            {pct.toFixed(2)}%)
          </span>
        </span>
      </div>
      <div className="mt-2 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series.points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
            <YAxis domain={['auto', 'auto']} hide />
            <Tooltip
              contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={(v) => fmtTime(v as number)}
              formatter={(value) => [`${Number(value).toFixed(4)} ${series.fiat}`, 'Preço']}
            />
            <Area type="linear" dataKey="price" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} dot={{ r: 2, fill: color, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
