import type { MarketSeries } from '@/lib/db';
import { cycleEfficiencyPct } from '@/lib/profitCalculator';
import { estimateCosts, resolveReferenceAmount, type CapitalSettings } from '@/lib/capitalSettings';
import { getMPesaWithdrawalFee } from '@/lib/mpesaFees';

/**
 * "Se eu tivesse usado esta regra no período X, o que teria acontecido?"
 * (spec section 16) - runs the exact same condition shape lib/alerts.ts
 * evaluates live, against real historical market_snapshots ticks instead.
 * Everything here is SIMULAÇÃO HISTÓRICA, never a future guarantee - see
 * the callers in app/(dashboard)/research/page.tsx for the banner this is
 * always shown under.
 */

export type BacktestRule =
  | { kind: 'price'; asset: string; fiat: string; side: 'buy' | 'sell'; operator: 'gte' | 'lte'; threshold: number }
  | { kind: 'spread'; asset: string; fiat: string; operator: 'gte' | 'lte'; threshold: number }
  | { kind: 'liquidity'; asset: string; fiat: string; side: 'buy' | 'sell'; operator: 'gte' | 'lte'; threshold: number }
  | { kind: 'cycle'; operator: 'gte' | 'lte'; threshold: number };

export type TriggerEvent = {
  t: number;
  value: number;
  /** Only ever set for a 'cycle' rule - a complete round trip has a real,
   *  well-defined result at one instant. price/spread/liquidity are
   *  one-sided signals with no defined exit - never fabricated here. */
  netResult?: number;
};

export type BacktestResult = {
  rule: BacktestRule;
  events: TriggerEvent[];
  ticksExamined: number;
};

function met(value: number, operator: 'gte' | 'lte', threshold: number): boolean {
  return operator === 'gte' ? value >= threshold : value <= threshold;
}

function findSeries(series: MarketSeries[], asset: string, fiat: string): MarketSeries | undefined {
  return series.find((s) => s.asset === asset && s.fiat === fiat);
}

export function runBacktest(rule: BacktestRule, series: MarketSeries[], settings: CapitalSettings, includeMpesaFee: boolean): BacktestResult {
  if (rule.kind === 'cycle') return runCycleBacktest(rule, series, settings, includeMpesaFee);

  const s = rule.kind === 'spread' ? findSeries(series, rule.asset, rule.fiat) : findSeries(series, rule.asset, rule.fiat);
  if (!s) return { rule, events: [], ticksExamined: 0 };

  const events: TriggerEvent[] = [];
  let wasMet = false;

  for (const tick of s.ticks) {
    let value: number | null = null;
    if (rule.kind === 'price') {
      value = rule.side === 'buy' ? tick.buy : tick.sell;
    } else if (rule.kind === 'spread') {
      value = tick.buy != null && tick.sell != null && tick.buy > 0 ? ((tick.sell - tick.buy) / tick.buy) * 100 : null;
    } else if (rule.kind === 'liquidity') {
      value = rule.side === 'buy' ? tick.buyDepth : tick.sellDepth;
    }

    if (value == null) continue;
    const isMet = met(value, rule.operator, rule.threshold);
    if (isMet && !wasMet) events.push({ t: tick.t, value });
    wasMet = isMet;
  }

  return { rule, events, ticksExamined: s.ticks.length };
}

function runCycleBacktest(
  rule: Extract<BacktestRule, { kind: 'cycle' }>,
  series: MarketSeries[],
  settings: CapitalSettings,
  includeMpesaFee: boolean
): BacktestResult {
  const mzn = findSeries(series, 'USDT', 'MZN');
  const zar = findSeries(series, 'USDT', 'ZAR');
  if (!mzn || !zar) return { rule, events: [], ticksExamined: 0 };

  // Both series are bucketed to the same minute grid (lib/db.ts's
  // getMarketSeries) - an exact match on `t` is a real, aligned instant,
  // not an interpolation.
  const zarByT = new Map(zar.ticks.map((t) => [t.t, t]));
  const events: TriggerEvent[] = [];
  let wasMet = false;
  let examined = 0;

  for (const mTick of mzn.ticks) {
    const zTick = zarByT.get(mTick.t);
    if (!zTick || mTick.buy == null || mTick.sell == null || zTick.buy == null || zTick.sell == null) continue;
    examined++;

    const value = cycleEfficiencyPct({ fiatABuy: mTick.buy, fiatASell: mTick.sell, fiatBBuy: zTick.buy, fiatBSell: zTick.sell });
    const isMet = met(value, rule.operator, rule.threshold);

    if (isMet && !wasMet) {
      // Single-trade approximation (no historical per-ad book exists to
      // replay the Phase 10 multi-merchant fee) - same model already used
      // by CurrencyCycle/Opportunity Center for a live cycle read.
      const { amount: referenceAmount } = resolveReferenceAmount(settings, null);
      const grossResult = (referenceAmount * value) / 100;
      const costs = estimateCosts(settings, grossResult).total;
      const mpesaFee = includeMpesaFee ? getMPesaWithdrawalFee(referenceAmount) : 0;
      events.push({ t: mTick.t, value, netResult: grossResult - costs - mpesaFee });
    }
    wasMet = isMet;
  }

  return { rule, events, ticksExamined: examined };
}
