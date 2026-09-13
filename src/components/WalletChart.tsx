'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CapitalPoint } from '@/lib/wallet';

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function WalletChart({ evolution, asset }: { evolution: CapitalPoint[]; asset: string }) {
  if (evolution.length === 0) {
    return (
      <p className="text-sm text-muted">
        Ainda sem movimentos para desenhar a evolução do capital. Regista um depósito, ou sincroniza ordens no Início.
      </p>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={evolution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradCapital" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtTime} stroke="var(--muted)" fontSize={11} minTickGap={50} />
          <YAxis domain={['auto', 'auto']} stroke="var(--muted)" fontSize={11} width={58} tickFormatter={(v) => Number(v).toFixed(2)} />
          <Tooltip
            contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(v) => fmtTime(v as number)}
            formatter={(value, name, item) => {
              const point = item?.payload as CapitalPoint | undefined;
              const deltaStr = point ? ` (${point.delta >= 0 ? '+' : ''}${point.delta.toFixed(4)} · ${point.label})` : '';
              return [`${Number(value).toFixed(4)} ${asset}${deltaStr}`, 'Saldo'];
            }}
          />
          <Area
            type="linear"
            dataKey="balance"
            stroke="var(--accent)"
            strokeWidth={2.5}
            fill="url(#gradCapital)"
            dot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
