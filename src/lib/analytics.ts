import { query } from '@/lib/db';

export type PeriodDays = 7 | 30 | 90 | null; // null = all time

export type PaymentMethodBreakdown = { method: string; count: number; volume: number };

export type FiatKpis = {
  fiat: string;
  buyVolume: number;
  sellVolume: number;
  grossProfit: number;
  marginPct: number; // grossProfit / buyVolume
  avgBuyPrice: number;
  avgSellPrice: number;
  buyCount: number;
  sellCount: number;
  cancelledCount: number;
  /** Avg (completed_at - created_at), minutes - null when no completed order
   *  in this period has both timestamps set. */
  avgCompletionMinutes: number | null;
  byMethod: PaymentMethodBreakdown[];
};

export type DailyPoint = { t: number; buyVolume: number; sellVolume: number; profit: number; cumulativeProfit: number };

export type AnalyticsData = {
  fiats: FiatKpis[];
  seriesByFiat: Record<string, DailyPoint[]>;
};

/**
 * Every number here comes straight from p2p_manager.orders (status =
 * 'completed', synced from Binance) - no simulation/manual data mixed in.
 * Grouped per fiat throughout: summing MZN and ZAR together would produce
 * a meaningless number.
 */
export async function getAnalytics(userId: string, days: PeriodDays): Promise<AnalyticsData> {
  const rows = await query<{
    fiat: string;
    side: 'buy' | 'sell';
    quantity: string;
    price: string;
    total_value: string;
    payment_method: string | null;
    created_at: string;
    completed_at: string;
  }>(
    days == null
      ? `select fiat, side, quantity, price, total_value, payment_method, created_at, completed_at
         from p2p_manager.orders
         where user_id = $1 and status = 'completed'
         order by completed_at asc`
      : `select fiat, side, quantity, price, total_value, payment_method, created_at, completed_at
         from p2p_manager.orders
         where user_id = $1 and status = 'completed' and completed_at > now() - ($2 || ' days')::interval
         order by completed_at asc`,
    days == null ? [userId] : [userId, days]
  );

  const cancelledRows = await query<{ fiat: string; n: string }>(
    days == null
      ? `select fiat, count(*) as n from p2p_manager.orders where user_id = $1 and status = 'cancelled' group by fiat`
      : `select fiat, count(*) as n from p2p_manager.orders where user_id = $1 and status = 'cancelled' and created_at > now() - ($2 || ' days')::interval group by fiat`,
    days == null ? [userId] : [userId, days]
  );
  const cancelledByFiat = new Map(cancelledRows.map((r) => [r.fiat, Number(r.n)]));

  const byFiat = new Map<
    string,
    {
      buyVolume: number;
      sellVolume: number;
      buyQty: number;
      sellQty: number;
      buyCount: number;
      sellCount: number;
      completionMinutesSum: number;
      completionMinutesCount: number;
      methodStats: Map<string, { count: number; volume: number }>;
    }
  >();
  const dayBucketsByFiat = new Map<string, Map<number, { buyVolume: number; sellVolume: number; profit: number }>>();

  for (const r of rows) {
    if (!byFiat.has(r.fiat)) {
      byFiat.set(r.fiat, {
        buyVolume: 0,
        sellVolume: 0,
        buyQty: 0,
        sellQty: 0,
        buyCount: 0,
        sellCount: 0,
        completionMinutesSum: 0,
        completionMinutesCount: 0,
        methodStats: new Map(),
      });
    }
    const agg = byFiat.get(r.fiat)!;
    const value = Number(r.total_value);
    const qty = Number(r.quantity);

    if (r.side === 'buy') {
      agg.buyVolume += value;
      agg.buyQty += qty;
      agg.buyCount += 1;
    } else {
      agg.sellVolume += value;
      agg.sellQty += qty;
      agg.sellCount += 1;
    }

    if (r.created_at && r.completed_at) {
      const minutes = (new Date(r.completed_at).getTime() - new Date(r.created_at).getTime()) / 60_000;
      if (minutes >= 0) {
        agg.completionMinutesSum += minutes;
        agg.completionMinutesCount += 1;
      }
    }

    const method = r.payment_method ?? 'Não indicado';
    if (!agg.methodStats.has(method)) agg.methodStats.set(method, { count: 0, volume: 0 });
    const methodStat = agg.methodStats.get(method)!;
    methodStat.count += 1;
    methodStat.volume += value;

    if (!dayBucketsByFiat.has(r.fiat)) dayBucketsByFiat.set(r.fiat, new Map());
    const dayBuckets = dayBucketsByFiat.get(r.fiat)!;
    const dayT = new Date(r.completed_at);
    dayT.setHours(0, 0, 0, 0);
    const key = dayT.getTime();
    if (!dayBuckets.has(key)) dayBuckets.set(key, { buyVolume: 0, sellVolume: 0, profit: 0 });
    const bucket = dayBuckets.get(key)!;
    if (r.side === 'buy') {
      bucket.buyVolume += value;
      bucket.profit -= value;
    } else {
      bucket.sellVolume += value;
      bucket.profit += value;
    }
  }

  const fiats: FiatKpis[] = [...byFiat.entries()]
    .map(([fiat, a]) => ({
      fiat,
      buyVolume: a.buyVolume,
      sellVolume: a.sellVolume,
      grossProfit: a.sellVolume - a.buyVolume,
      marginPct: a.buyVolume > 0 ? ((a.sellVolume - a.buyVolume) / a.buyVolume) * 100 : 0,
      avgBuyPrice: a.buyQty > 0 ? a.buyVolume / a.buyQty : 0,
      avgSellPrice: a.sellQty > 0 ? a.sellVolume / a.sellQty : 0,
      buyCount: a.buyCount,
      sellCount: a.sellCount,
      cancelledCount: cancelledByFiat.get(fiat) ?? 0,
      avgCompletionMinutes: a.completionMinutesCount > 0 ? a.completionMinutesSum / a.completionMinutesCount : null,
      byMethod: [...a.methodStats.entries()]
        .map(([method, s]) => ({ method, count: s.count, volume: s.volume }))
        .sort((x, y) => y.volume - x.volume),
    }))
    .sort((a, b) => b.buyVolume + b.sellVolume - (a.buyVolume + a.sellVolume));

  const seriesByFiat: Record<string, DailyPoint[]> = {};
  for (const [fiat, buckets] of dayBucketsByFiat.entries()) {
    let cumulative = 0;
    seriesByFiat[fiat] = [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([t, b]) => {
        cumulative += b.profit;
        return { t, buyVolume: b.buyVolume, sellVolume: b.sellVolume, profit: b.profit, cumulativeProfit: cumulative };
      });
  }

  return { fiats, seriesByFiat };
}
