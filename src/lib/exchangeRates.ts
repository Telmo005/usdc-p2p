import type { MarketSeries } from '@/lib/db';

export type MidRates = { mznRate: number | null; zarRate: number | null };

/**
 * Mid-market MZN/ZAR-per-USD(T) rates derived from the real USDT/MZN and
 * USDT/ZAR P2P order books - the only cross-rate this app can derive
 * without fabricating one. ESTIMATED, not REAL (see src/lib/dataQuality.ts)
 * - always pair a rate from this with a `<DataTag source="estimated" />`.
 */
export function getMidRates(marketSeries: MarketSeries[]): MidRates {
  const mzn = marketSeries.find((s) => s.fiat === 'MZN');
  const zar = marketSeries.find((s) => s.fiat === 'ZAR');
  const mznRate = mzn?.lastBuy != null && mzn?.lastSell != null ? (mzn.lastBuy + mzn.lastSell) / 2 : null;
  const zarRate = zar?.lastBuy != null && zar?.lastSell != null ? (zar.lastBuy + zar.lastSell) / 2 : null;
  return { mznRate, zarRate };
}
