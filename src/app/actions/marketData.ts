'use server';

import { requireUser } from '@/lib/auth';
import { fetchPairBooks, type PairBooks } from '@/lib/multiAdOpportunity';

/**
 * Manual/auto refresh (Phase 17) for the live per-ad book - called directly
 * from a client component's event handler, not a <form>, since the caller
 * needs the fresh data back to merge into its own state. No user data is
 * touched (fetchPairBooks only reads Binance's public book), but every
 * action in this app checks auth for consistency.
 */
export async function refreshPairBooksAction(asset: string, fiat: string): Promise<PairBooks> {
  await requireUser();
  return fetchPairBooks(asset, fiat);
}
