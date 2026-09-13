import { getMarketSeries } from '@/lib/db';
import { getMarketAnalysis, type MarketAnalysisPair } from '@/lib/marketAnalysis';
import { cycleEfficiencyPct } from '@/lib/profitCalculator';
import { getFreshness, type Freshness } from '@/lib/dataQuality';

/**
 * Opportunity detection - built entirely from data already persisted by the
 * market-sync cron (market_snapshots, audit_log reversals) plus the
 * already-existing cycleEfficiencyPct math (see lib/alerts.ts, which already
 * notifies on this same number - this is the complementary live/explained
 * view, not a duplicate). No new schema, nothing stored: an opportunity here
 * is a fresh read of current real conditions, re-evaluated on every visit.
 *
 * Every score tier below is a plain constant, and every `why` line names
 * the real number and the threshold it crossed - spec's own rule (section
 * 34): never a bare score with no derivation.
 */

const CYCLE_REFERENCE_AMOUNT = 1000; // MZN - same default CurrencyCycle.tsx uses
const REVERSAL_RECENCY_HOURS = 1;
const SERIES_WINDOW_HOURS = 24; // plenty to guarantee a lastBuy/lastSell given the ~10 min cron cadence
const FIXED_COSTS_SCORE = 5; // out of 15 - no persisted fee/cost config exists yet (spec section 19, separate phase)

export type OpportunityScore = { price: number; liquidity: number; stability: number; costs: number; dataQuality: number; total: number };

export type Opportunity = {
  id: string;
  kind: 'cycle' | 'reversal';
  market: string;
  headline: string;
  detectedAt: number;
  referenceAmount: number | null;
  fiat: string | null;
  grossResult: number | null;
  costs: number | null;
  netResult: number | null;
  score: OpportunityScore;
  why: string[];
};

export type MonitoredPair = {
  asset: string;
  fiat: string;
  spreadPct: number | null;
  volatilityBuyPct: number | null;
  volatilitySellPct: number | null;
  avgLiquidity: number | null;
};

export type OpportunitiesResult = {
  opportunities: Opportunity[];
  monitoredCyclePct: number | null;
  monitoredPairs: MonitoredPair[];
};

function scorePriceMagnitude(pct: number): number {
  const abs = Math.abs(pct);
  if (abs >= 2) return 30;
  if (abs >= 1) return 22;
  if (abs >= 0.5) return 14;
  return 8;
}

function scoreLiquidity(avgLiquidity: number | null): number {
  if (avgLiquidity == null) return 0;
  if (avgLiquidity >= 10) return 25;
  if (avgLiquidity >= 5) return 16;
  if (avgLiquidity >= 2) return 8;
  return 2;
}

function scoreStability(volatilityPct: number | null): number {
  if (volatilityPct == null) return 0;
  if (volatilityPct < 1) return 20;
  if (volatilityPct < 3) return 13;
  if (volatilityPct < 6) return 6;
  return 2;
}

function scoreDataQuality(freshness: Freshness): number {
  if (freshness === 'live') return 10;
  if (freshness === 'delayed') return 6;
  if (freshness === 'stale') return 2;
  return 0;
}

function buildScore(price: number, liquidity: number, stability: number, dataQuality: number): OpportunityScore {
  const costs = FIXED_COSTS_SCORE;
  return { price, liquidity, stability, costs, dataQuality, total: price + liquidity + stability + costs + dataQuality };
}

export async function getOpportunities(): Promise<OpportunitiesResult> {
  const [marketSeries, marketAnalysis] = await Promise.all([getMarketSeries(SERIES_WINDOW_HOURS), getMarketAnalysis(7)]);

  const mzn = marketSeries.find((s) => s.asset === 'USDT' && s.fiat === 'MZN');
  const zar = marketSeries.find((s) => s.asset === 'USDT' && s.fiat === 'ZAR');
  const mznAnalysis: MarketAnalysisPair | undefined = marketAnalysis.find((p) => p.asset === 'USDT' && p.fiat === 'MZN');
  const zarAnalysis: MarketAnalysisPair | undefined = marketAnalysis.find((p) => p.asset === 'USDT' && p.fiat === 'ZAR');

  const opportunities: Opportunity[] = [];

  // --- Cycle opportunity: MZN -> USDT -> ZAR -> USDT -> MZN, right now ---
  let cyclePct: number | null = null;
  if (mzn?.lastBuy != null && mzn?.lastSell != null && zar?.lastBuy != null && zar?.lastSell != null) {
    cyclePct = cycleEfficiencyPct({ fiatABuy: mzn.lastBuy, fiatASell: mzn.lastSell, fiatBBuy: zar.lastBuy, fiatBSell: zar.lastSell });
  }

  if (cyclePct != null && cyclePct > 0) {
    const mznTickAt = mzn!.ticks.length > 0 ? mzn!.ticks[mzn!.ticks.length - 1].t : null;
    const zarTickAt = zar!.ticks.length > 0 ? zar!.ticks[zar!.ticks.length - 1].t : null;
    const oldestTick = [mznTickAt, zarTickAt].filter((t): t is number => t != null).sort((a, b) => a - b)[0] ?? null;
    const freshness = getFreshness(oldestTick, { delayedAfterMs: 5 * 60_000, staleAfterMs: 30 * 60_000 });

    const liquidity =
      mznAnalysis?.avgLiquidity != null && zarAnalysis?.avgLiquidity != null
        ? Math.min(mznAnalysis.avgLiquidity, zarAnalysis.avgLiquidity)
        : null;
    const volatility =
      mznAnalysis && zarAnalysis
        ? Math.max(
            mznAnalysis.volatilityBuyPct ?? 0,
            mznAnalysis.volatilitySellPct ?? 0,
            zarAnalysis.volatilityBuyPct ?? 0,
            zarAnalysis.volatilitySellPct ?? 0
          )
        : null;

    const grossResult = (CYCLE_REFERENCE_AMOUNT * cyclePct) / 100;

    opportunities.push({
      id: 'cycle-mzn-zar',
      kind: 'cycle',
      market: 'USDT/MZN ⇄ USDT/ZAR',
      headline: `Ciclo MZN⇄ZAR com eficiência real de +${cyclePct.toFixed(2)}% neste momento`,
      detectedAt: Date.now(),
      referenceAmount: CYCLE_REFERENCE_AMOUNT,
      fiat: 'MZN',
      grossResult,
      costs: 0,
      netResult: grossResult,
      score: buildScore(scorePriceMagnitude(cyclePct), scoreLiquidity(liquidity), scoreStability(volatility), scoreDataQuality(freshness)),
      why: [
        `Eficiência do ciclo (ida MZN→USDT→ZAR, volta ZAR→USDT→MZN) = +${cyclePct.toFixed(2)}% agora, calculada com os preços reais de compra/venda dos dois mercados (mesma fórmula usada nos alertas de ciclo em Configurações).`,
        `Resultado bruto estimado para uma viagem de referência de ${CYCLE_REFERENCE_AMOUNT} MZN: ${grossResult.toFixed(2)} MZN.`,
        `Custos: sem configuração de taxas/custos guardada ainda - pontuação de custos fixa em ${FIXED_COSTS_SCORE}/15 (neutra), o resultado líquido acima NÃO desconta taxas reais que possas ter.`,
        `Liquidez considerada: ${liquidity != null ? liquidity.toFixed(1) : 'sem dados'} anúncios em média (o mais baixo dos dois mercados).`,
        `Estabilidade considerada: volatilidade recente de até ${volatility != null ? volatility.toFixed(2) : '—'}% (7 dias) - quanto menor, mais estável o preço usado.`,
        `Dados com ${freshness === 'live' ? 'menos de 5 min' : freshness === 'delayed' ? 'até 30 min' : 'mais de 30 min'} de idade.`,
      ],
    });
  }

  // --- Reversal opportunities: any confirmed direction change in the last hour ---
  const recentCutoff = Date.now() - REVERSAL_RECENCY_HOURS * 3600_000;
  for (const series of marketSeries) {
    for (const r of series.reversals) {
      if (r.t < recentCutoff) continue;
      const analysis = marketAnalysis.find((p) => p.asset === series.asset && p.fiat === series.fiat);
      const movePct = r.fromPrice > 0 ? (Math.abs(r.toPrice - r.fromPrice) / r.fromPrice) * 100 : 0;
      const volatility = r.side === 'buy' ? analysis?.volatilityBuyPct ?? null : analysis?.volatilitySellPct ?? null;
      const freshness = getFreshness(r.t, { delayedAfterMs: 15 * 60_000, staleAfterMs: 60 * 60_000 });

      opportunities.push({
        id: `reversal-${series.asset}-${series.fiat}-${r.side}-${r.t}`,
        kind: 'reversal',
        market: `${series.asset}/${series.fiat}`,
        headline:
          r.side === 'buy'
            ? `Preço de compra de ${series.asset} parou de ${r.newTrend === 'up' ? 'cair' : 'subir'} - possível ${r.newTrend === 'up' ? 'mínimo' : 'novo máximo'} recente`
            : `Preço de venda de ${series.asset} ${r.newTrend === 'down' ? 'atingiu um pico e começou a descer' : 'começou a recuperar'}`,
        detectedAt: r.t,
        referenceAmount: null,
        fiat: series.fiat,
        grossResult: null,
        costs: null,
        netResult: null,
        score: buildScore(scorePriceMagnitude(movePct), scoreLiquidity(analysis?.avgLiquidity ?? null), scoreStability(volatility), scoreDataQuality(freshness)),
        why: [
          `Reversão de tendência confirmada (não um único tick de ruído - exige 2 leituras seguidas na nova direção, ver lib/marketAnalysis.ts): preço passou de ${r.fromPrice.toFixed(2)} para ${r.toPrice.toFixed(2)} ${series.fiat} (${movePct.toFixed(2)}%).`,
          `Sem resultado bruto/líquido aqui - isto é um sinal de mercado, não uma operação com resultado definido; usa a Simulação para planear um valor concreto a este preço.`,
          `Liquidez no momento: ${analysis?.avgLiquidity != null ? analysis.avgLiquidity.toFixed(1) : 'sem dados'} anúncios em média.`,
          `Volatilidade recente (7 dias) deste lado: ${volatility != null ? `${volatility.toFixed(2)}%` : 'sem dados'}.`,
        ],
      });
    }
  }

  opportunities.sort((a, b) => b.score.total - a.score.total);

  const monitoredPairs: MonitoredPair[] = marketSeries
    .map((s) => {
      const analysis = marketAnalysis.find((p) => p.asset === s.asset && p.fiat === s.fiat);
      const spreadPct = s.lastBuy != null && s.lastSell != null && s.lastBuy > 0 ? ((s.lastSell - s.lastBuy) / s.lastBuy) * 100 : null;
      return {
        asset: s.asset,
        fiat: s.fiat,
        spreadPct,
        volatilityBuyPct: analysis?.volatilityBuyPct ?? null,
        volatilitySellPct: analysis?.volatilitySellPct ?? null,
        avgLiquidity: analysis?.avgLiquidity ?? null,
      };
    });

  return { opportunities, monitoredCyclePct: cyclePct, monitoredPairs };
}
