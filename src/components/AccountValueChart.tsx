'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AccountValuePoint } from '@/lib/db';

function fmtDate(ms: number) {
  return new Date(ms).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Below this span, a "trend" would just be reading noise into two or three
// points - the honest empty state stays until there's enough real history.
const MIN_SPAN_MS = 6 * 3600_000;

/**
 * Spec's "evolução do patrimônio" - real points only, from
 * p2p_manager.account_snapshots (see lib/wallet.ts's recordAccountSnapshot,
 * written by the market-sync cron). Never backfilled: if this table is
 * new, there's genuinely no past to show.
 */
export function AccountValueChart({ points }: { points: AccountValuePoint[] }) {
  const span = points.length >= 2 ? points[points.length - 1].t - points[0].t : 0;

  if (points.length === 0 || span < MIN_SPAN_MS) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
        Ainda a acumular histórico - este gráfico começa a fazer sentido a partir de agora, não pode ser reconstruído para o
        passado.
        {points.length > 0 && ` (${points.length} ponto(s) registado(s) até agora)`}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-base font-semibold">Evolução do patrimônio (USD)</h3>
      <p className="mt-1 text-xs text-muted">Um ponto real por cada corrida da sincronização de mercado, desde que este histórico começou.</p>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradPortfolio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={fmtDate}
              stroke="var(--muted)"
              fontSize={11}
              minTickGap={60}
            />
            <YAxis domain={['auto', 'auto']} stroke="var(--muted)" fontSize={11} width={58} tickFormatter={(v) => Number(v).toFixed(0)} />
            <Tooltip
              contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={(v) => fmtDate(v as number)}
              formatter={(value) => [`${Number(value).toLocaleString('pt-PT', { maximumFractionDigits: 4 })} USD`, 'Total']}
            />
            <Area
              type="linear"
              dataKey="totalUsd"
              name="Total (USD)"
              stroke="var(--accent)"
              strokeWidth={2.5}
              fill="url(#gradPortfolio)"
              dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
