'use server';

import { requireUser } from '@/lib/auth';
import { fetchPairBooks, type PairBooks } from '@/lib/multiAdOpportunity';
import { getAllWatchedAdvertiserNicknames } from '@/lib/watchlist';
import { recordAdvertiserSightings } from '@/lib/advertiserHistory';

/**
 * Manual/auto refresh (Phase 17) for the live per-ad book - called directly
 * from a client component's event handler, not a <form>, since the caller
 * needs the fresh data back to merge into its own state. No user data is
 * touched (fetchPairBooks only reads Binance's public book), but every
 * action in this app checks auth for consistency.
 *
 * Also records history (Phase 18) for any favorited advertiser found in
 * this same response - reuses the fetch this action is already making, no
 * extra Binance call.
 */
export async function refreshPairBooksAction(asset: string, fiat: string): Promise<PairBooks> {
  await requireUser();
  const books = await fetchPairBooks(asset, fiat);

  if (!books.error) {
    const watchedNicknames = new Set(await getAllWatchedAdvertiserNicknames());
    if (watchedNicknames.size > 0) {
      await recordAdvertiserSightings(asset, fiat, 'buy', books.buyAds, watchedNicknames);
      await recordAdvertiserSightings(asset, fiat, 'sell', books.sellAds, watchedNicknames);
    }
  }

  return books;
}
