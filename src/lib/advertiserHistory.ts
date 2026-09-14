import { query } from '@/lib/db';
import type { P2PAd } from '@/lib/binancePublicP2P';

/**
 * Real per-ad price history, scoped to advertisers on SOMEONE's Favoritos
 * list only (lib/watchlist.ts's getAllWatchedAdvertiserNicknames) - never
 * every ad ever seen, which would grow unbounded for no reason. Both
 * writers below only ever consume an `ads` array that was already fetched
 * for another purpose (the market-sync cron's own snapshot, or a manual/
 * auto refresh) - this never triggers its own Binance call.
 */
export async function recordAdvertiserSightings(
  asset: string,
  fiat: string,
  side: 'buy' | 'sell',
  ads: P2PAd[],
  watchedNicknames: Set<string>
): Promise<void> {
  const matches = ads.filter((a) => watchedNicknames.has(a.advertiserNickname));
  if (matches.length === 0) return;

  for (const ad of matches) {
    await query(
      `insert into p2p_manager.advertiser_price_history (advertiser_nickname, asset, fiat, side, price)
       values ($1, $2, $3, $4, $5)`,
      [ad.advertiserNickname, asset, fiat, side, ad.price]
    );
  }
}

export type AdvertiserHistorySeries = {
  asset: string;
  fiat: string;
  side: 'buy' | 'sell';
  points: Array<{ t: number; price: number }>;
};

/** No backfill possible (same as account_snapshots) - history only starts
 *  accumulating from whenever a nickname was first favorited and this
 *  shipped, never invented for the period before. */
export async function getAdvertiserHistory(nickname: string, hours = 24 * 7): Promise<AdvertiserHistorySeries[]> {
  const rows = await query<{ asset: string; fiat: string; side: 'buy' | 'sell'; price: string; created_at: string }>(
    `select asset, fiat, side, price, created_at from p2p_manager.advertiser_price_history
     where advertiser_nickname = $1 and created_at > now() - ($2 || ' hours')::interval
     order by created_at asc`,
    [nickname, hours]
  );

  const bySeries = new Map<string, AdvertiserHistorySeries>();
  for (const r of rows) {
    const key = `${r.asset}/${r.fiat}/${r.side}`;
    if (!bySeries.has(key)) bySeries.set(key, { asset: r.asset, fiat: r.fiat, side: r.side, points: [] });
    bySeries.get(key)!.points.push({ t: new Date(r.created_at).getTime(), price: Number(r.price) });
  }
  return [...bySeries.values()];
}
