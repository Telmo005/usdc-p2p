'use client';

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DailyPoint } from '@/lib/analytics';

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

export function AnalyticsChart({ series, fiat }: { series: DailyPoint[]; fiat: string }) {
  if (series.length === 0) {
    return <p className="text-sm text-muted">Sem operações concluídas neste período.</p>;
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtDate} stroke="var(--muted)" fontSize={11} minTickGap={40} />
          <YAxis yAxisId="volume" stroke="var(--muted)" fontSize={11} width={54} tickFormatter={(v) => Number(v).toLocaleString('pt-PT', { maximumFractionDigits: 0 })} />
          <YAxis
            yAxisId="profit"
            orientation="right"
            stroke="var(--accent)"
            fontSize={11}
            width={54}
            tickFormatter={(v) => Number(v).toLocaleString('pt-PT', { maximumFractionDigits: 0 })}
          />
          <Tooltip
            contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(v) => fmtDate(v as number)}
            formatter={(value, name) => [`${Number(value).toLocaleString('pt-PT', { maximumFractionDigits: 2 })} ${fiat}`, String(name)]}
          />
          <Bar yAxisId="volume" dataKey="buyVolume" name="Comprado" fill="var(--info)" radius={[3, 3, 0, 0]} />
          <Bar yAxisId="volume" dataKey="sellVolume" name="Vendido" fill="var(--positive)" radius={[3, 3, 0, 0]} />
          <Line
            yAxisId="profit"
            type="linear"
            dataKey="cumulativeProfit"
            name="Lucro acumulado"
            stroke="var(--accent)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
