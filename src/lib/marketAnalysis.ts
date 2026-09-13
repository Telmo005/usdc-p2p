import { query } from '@/lib/db';
import { fetchP2PSnapshot } from '@/lib/binancePublicP2P';
import { sendPush } from '@/lib/messagingClient';

/**
 * The pairs this app actively tracks. USDT/MZN is the user's primary market;
 * USDT/ZAR is tracked too since it's the other side of the original
 * MZN⇄ZAR arbitrage idea and comes for free once the engine exists.
 * Extending this list is the only step needed to track more pairs later.
 */
export const TRACKED_PAIRS: Array<{ asset: string; fiat: string }> = [
  { asset: 'USDT', fiat: 'MZN' },
  { asset: 'USDT', fiat: 'ZAR' },
];

const SIDES = ['buy', 'sell'] as const;
type Side = (typeof SIDES)[number];

/** A tick must move at least this much to count as a real signal - filters
 *  out sub-noise jitter between near-identical ad prices. */
const MIN_TICK_PCT = 0.0015;
/** Consecutive same-direction ticks required before a reversal is
 *  considered confirmed rather than a single blip. */
const CONFIRM_STREAK = 2;

type TrendRow = {
  trend: 'up' | 'down' | null;
  candidate_trend: 'up' | 'down' | null;
  candidate_streak: number;
  trend_started_price: string | null;
  last_price: string | null;
};

export type ReversalEvent = {
  asset: string;
  fiat: string;
  side: Side;
  newTrend: 'up' | 'down';
  fromPrice: number;
  toPrice: number;
};

function buildReversalMessage(ev: ReversalEvent): { title: string; body: string } {
  const pct = (((ev.toPrice - ev.fromPrice) / ev.fromPrice) * 100).toFixed(2);
  const pair = `${ev.asset}/${ev.fiat}`;

  if (ev.side === 'buy') {
    if (ev.newTrend === 'up') {
      return {
        title: `${pair}: preço de compra parou de cair`,
        body: `O preço a que compras ${ev.asset} passou de ${ev.fromPrice.toFixed(2)} para ${ev.toPrice.toFixed(2)} ${ev.fiat} e virou para subida (${pct}%). Se ainda não compraste, este foi o ponto mais baixo recente.`,
      };
    }
    return {
      title: `${pair}: preço de compra a descer`,
      body: `O preço a que compras ${ev.asset} passou de ${ev.fromPrice.toFixed(2)} para ${ev.toPrice.toFixed(2)} ${ev.fiat} e virou para queda (${pct}%). Pode compensar esperar antes de comprar.`,
    };
  }

  if (ev.newTrend === 'down') {
    return {
      title: `${pair}: preço de venda atingiu um pico`,
      body: `O preço a que vendes ${ev.asset} passou de ${ev.fromPrice.toFixed(2)} para ${ev.toPrice.toFixed(2)} ${ev.fiat} e virou para queda (${pct}%). Se tens ${ev.asset} para vender, este foi o pico recente.`,
    };
  }
  return {
    title: `${pair}: preço de venda a recuperar`,
    body: `O preço a que vendes ${ev.asset} passou de ${ev.fromPrice.toFixed(2)} para ${ev.toPrice.toFixed(2)} ${ev.fiat} e virou para subida (${pct}%).`,
  };
}

/**
 * Feeds one (asset, fiat, side) price tick into the confirmation state
 * machine and returns a reversal event only when one just got confirmed -
 * i.e. this reports what already happened, never a prediction.
 */
async function processTick(platform: string, asset: string, fiat: string, side: Side, price: number): Promise<ReversalEvent | null> {
  const [state] = await query<TrendRow>(
    `select trend, candidate_trend, candidate_streak, trend_started_price, last_price
     from p2p_manager.market_trend_state where platform = $1 and asset = $2 and fiat = $3 and side = $4`,
    [platform, asset, fiat, side]
  );

  if (!state) {
    await query(
      `insert into p2p_manager.market_trend_state (platform, asset, fiat, side, trend_started_price, last_price)
       values ($1, $2, $3, $4, $5, $5)`,
      [platform, asset, fiat, side, price]
    );
    return null;
  }

  const lastPrice = Number(state.last_price);
  const pct = (price - lastPrice) / lastPrice;
  const direction: 'up' | 'down' | null = pct > MIN_TICK_PCT ? 'up' : pct < -MIN_TICK_PCT ? 'down' : null;

  let candidateTrend = state.candidate_trend;
  let candidateStreak = state.candidate_streak;
  let trend = state.trend;
  let trendStartedPrice = state.trend_started_price ? Number(state.trend_started_price) : price;
  let reversal: ReversalEvent | null = null;

  if (direction) {
    if (direction === candidateTrend) {
      candidateStreak += 1;
    } else {
      candidateTrend = direction;
      candidateStreak = 1;
    }

    if (candidateStreak >= CONFIRM_STREAK && candidateTrend !== trend) {
      if (trend !== null) {
        reversal = { asset, fiat, side, newTrend: candidateTrend, fromPrice: trendStartedPrice, toPrice: price };
      }
      trend = candidateTrend;
      trendStartedPrice = price;
    }
  }

  await query(
    `update p2p_manager.market_trend_state
     set candidate_trend = $5, candidate_streak = $6, trend = $7, trend_started_price = $8, last_price = $9, updated_at = now()
     where platform = $1 and asset = $2 and fiat = $3 and side = $4`,
    [platform, asset, fiat, side, candidateTrend, candidateStreak, trend, trendStartedPrice, price]
  );

  return reversal;
}

async function notifyReversal(ev: ReversalEvent): Promise<void> {
  const { title, body } = buildReversalMessage(ev);

  const profiles = await query<{ id: string }>(`select id from p2p_manager.profiles where role in ('admin', 'trader')`);
  for (const p of profiles) {
    await query(`insert into p2p_manager.notifications (user_id, type, title, body) values ($1, 'market_trend', $2, $3)`, [p.id, title, body]);
  }

  await sendPush(title, body);

  await query(
    `insert into p2p_manager.audit_log (action, entity_type, entity_id, after)
     values ('market_reversal', 'market_trend_state', $1, $2)`,
    [`${ev.asset}-${ev.fiat}-${ev.side}`, JSON.stringify(ev)]
  );
}

export type MarketAnalysisPair = {
  asset: string;
  fiat: string;
  volatilityBuyPct: number | null;
  volatilitySellPct: number | null;
  reversalCount: number;
  /** Reversal frequency by hour (0-23), local server time - a real market
   *  signal (confirmed direction change) unlike raw snapshot counts, which
   *  would just reflect our own ~10 min polling schedule, not real activity. */
  reversalsByHour: number[];
  avgLiquidity: number | null;
  liquidityTrend: 'up' | 'down' | 'flat' | null;
};

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

/**
 * Market intelligence for Análise, built entirely from what the existing
 * cron already persists (market_snapshots, audit_log reversal events) -
 * no new data collection needed. See DailyPoint from marketAnalysis and the
 * "horários de maior atividade" note in the Phase 5 plan for why reversal
 * frequency, not raw tick count, is the honest signal here.
 */
export async function getMarketAnalysis(days: number): Promise<MarketAnalysisPair[]> {
  const hours = days * 24;
  const results: MarketAnalysisPair[] = [];

  for (const { asset, fiat } of TRACKED_PAIRS) {
    const snaps = await query<{ side: 'buy' | 'sell'; avg_top_price: string; sample_size: number }>(
      `select side, avg_top_price, sample_size from p2p_manager.market_snapshots
       where platform = 'binance' and asset = $1 and fiat = $2 and created_at > now() - ($3 || ' hours')::interval`,
      [asset, fiat, hours]
    );
    const prevSnaps = await query<{ sample_size: number }>(
      `select sample_size from p2p_manager.market_snapshots
       where platform = 'binance' and asset = $1 and fiat = $2
         and created_at <= now() - ($3 || ' hours')::interval
         and created_at > now() - ($4 || ' hours')::interval`,
      [asset, fiat, hours, hours * 2]
    );
    const reversals = await query<{ created_at: string }>(
      `select created_at from p2p_manager.audit_log
       where action = 'market_reversal' and entity_id like $1 and created_at > now() - ($2 || ' hours')::interval`,
      [`${asset}-${fiat}-%`, hours]
    );

    const buyPrices = snaps.filter((s) => s.side === 'buy').map((s) => Number(s.avg_top_price));
    const sellPrices = snaps.filter((s) => s.side === 'sell').map((s) => Number(s.avg_top_price));
    const volatility = (prices: number[]): number | null => {
      if (prices.length === 0) return null;
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const avg = average(prices)!;
      return avg > 0 ? ((max - min) / avg) * 100 : null;
    };

    const curLiquidity = average(snaps.map((s) => s.sample_size));
    const prevLiquidity = average(prevSnaps.map((s) => s.sample_size));
    let liquidityTrend: 'up' | 'down' | 'flat' | null = null;
    if (curLiquidity != null && prevLiquidity != null && prevLiquidity > 0) {
      const changePct = ((curLiquidity - prevLiquidity) / prevLiquidity) * 100;
      liquidityTrend = changePct > 5 ? 'up' : changePct < -5 ? 'down' : 'flat';
    }

    const reversalsByHour = new Array(24).fill(0);
    for (const r of reversals) reversalsByHour[new Date(r.created_at).getHours()] += 1;

    results.push({
      asset,
      fiat,
      volatilityBuyPct: volatility(buyPrices),
      volatilitySellPct: volatility(sellPrices),
      reversalCount: reversals.length,
      reversalsByHour,
      avgLiquidity: curLiquidity,
      liquidityTrend,
    });
  }

  return results;
}

export type MarketSyncResult = {
  checked: Array<{ asset: string; fiat: string; side: Side; price: number | null; sampleSize: number | null }>;
  spreads: Array<{ asset: string; fiat: string; spreadPct: number | null }>;
  liquidity: Array<{ asset: string; fiat: string; side: Side; sampleSize: number | null }>;
  reversals: ReversalEvent[];
  errors: string[];
};

/**
 * Runs one full tick: snapshot every tracked pair/side, feed the trend
 * state machine, notify on confirmed reversals. Called by the market-sync
 * cron route, which also calls lib/alerts.ts's evaluateAlerts() itself
 * afterwards (not from in here - the route is the only place with both
 * this result and the account snapshot delta alerts need). Safe to call as
 * often as needed - every call is one real, independent market read,
 * nothing is cached or simulated.
 */
export async function runMarketSync(): Promise<MarketSyncResult> {
  const platform = 'binance';
  const checked: MarketSyncResult['checked'] = [];
  const reversals: ReversalEvent[] = [];
  const errors: string[] = [];

  for (const { asset, fiat } of TRACKED_PAIRS) {
    for (const side of SIDES) {
      try {
        const snapshot = await fetchP2PSnapshot(asset, fiat, side);
        if (!snapshot) {
          checked.push({ asset, fiat, side, price: null, sampleSize: null });
          continue;
        }

        await query(
          `insert into p2p_manager.market_snapshots (platform, asset, fiat, side, best_price, avg_top_price, sample_size)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [platform, asset, fiat, side, snapshot.bestPrice, snapshot.avgTopPrice, snapshot.sampleSize]
        );

        // avgTopPrice (mean of the 5 best ads), not bestPrice (the single
        // top ad) - one thin/outlier ad at the very top of the book would
        // otherwise swing the whole signal. Seen in practice on USDT/ZAR:
        // best_price 18 vs avg_top_price 16.65, a single ad far from the
        // rest of the book.
        checked.push({ asset, fiat, side, price: snapshot.avgTopPrice, sampleSize: snapshot.sampleSize });

        const reversal = await processTick(platform, asset, fiat, side, snapshot.avgTopPrice);
        if (reversal) {
          reversals.push(reversal);
          await notifyReversal(reversal);
        }
      } catch (err) {
        errors.push(`${asset}/${fiat}/${side}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const spreads: MarketSyncResult['spreads'] = TRACKED_PAIRS.map(({ asset, fiat }) => {
    const buy = checked.find((c) => c.asset === asset && c.fiat === fiat && c.side === 'buy')?.price;
    const sell = checked.find((c) => c.asset === asset && c.fiat === fiat && c.side === 'sell')?.price;
    const spreadPct = buy != null && sell != null && buy > 0 ? ((sell - buy) / buy) * 100 : null;
    return { asset, fiat, spreadPct };
  });

  const liquidity: MarketSyncResult['liquidity'] = checked.map((c) => ({ asset: c.asset, fiat: c.fiat, side: c.side, sampleSize: c.sampleSize }));

  return { checked, spreads, liquidity, reversals, errors };
}
