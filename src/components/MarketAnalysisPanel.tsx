import { DataTag } from '@/components/DataTag';
import type { MarketAnalysisPair } from '@/lib/marketAnalysis';

const TREND_LABEL: Record<'up' | 'down' | 'flat', string> = { up: 'a aumentar', down: 'a diminuir', flat: 'estável' };

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

function peakHour(reversalsByHour: number[]): number | null {
  const max = Math.max(...reversalsByHour);
  return max > 0 ? reversalsByHour.indexOf(max) : null;
}

/** Spec's "Market Analysis" - volatility, reversal frequency (the honest
 *  version of "horários de maior atividade", see lib/marketAnalysis.ts),
 *  and liquidity trend, all derived from data the market-sync cron already
 *  persists (market_snapshots, audit_log reversal events). */
export function MarketAnalysisPanel({ pairs }: { pairs: MarketAnalysisPair[] }) {
  return (
    <div className="flex flex-col gap-4">
      {pairs.map((p) => {
        const peak = peakHour(p.reversalsByHour);
        return (
          <div key={`${p.asset}-${p.fiat}`} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">
                {p.asset}/{p.fiat}
              </h3>
              <DataTag source="historical" />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-xs text-muted">Volatilidade (compra)</div>
                <div className="font-mono font-semibold">{p.volatilityBuyPct != null ? `${fmt(p.volatilityBuyPct)}%` : '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Volatilidade (venda)</div>
                <div className="font-mono font-semibold">{p.volatilitySellPct != null ? `${fmt(p.volatilitySellPct)}%` : '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Reversões de tendência</div>
                <div className="font-mono font-semibold">{p.reversalCount}</div>
                {peak != null && <div className="mt-0.5 text-[11px] text-muted">mais frequentes por volta das {peak}h</div>}
              </div>
              <div>
                <div className="text-xs text-muted">Liquidez média (anúncios)</div>
                <div className="font-mono font-semibold">{p.avgLiquidity != null ? fmt(p.avgLiquidity, 1) : '—'}</div>
                {p.liquidityTrend && <div className="mt-0.5 text-[11px] text-muted">{TREND_LABEL[p.liquidityTrend]} vs. período anterior</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
