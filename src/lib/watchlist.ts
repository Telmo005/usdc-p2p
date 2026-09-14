import { query } from '@/lib/db';

export type WatchlistItem = {
  id: string;
  kind: 'counterparty' | 'advertiser';
  counterparty_id: string | null;
  advertiser_nickname: string | null;
  created_at: string;
};

/**
 * Two kinds of favorite, both real and stable identities - never a pair
 * (both tracked pairs are already always shown everywhere) and never an
 * ad number (an advNo churns constantly; the advertiser behind it doesn't).
 */
export async function getWatchlist(userId: string): Promise<WatchlistItem[]> {
  return query<WatchlistItem>(
    `select id, kind, counterparty_id, advertiser_nickname, created_at
     from p2p_manager.watchlist_items where user_id = $1 order by created_at desc`,
    [userId]
  );
}

export async function getWatchedCounterpartyIds(userId: string): Promise<string[]> {
  const rows = await query<{ counterparty_id: string }>(
    `select counterparty_id from p2p_manager.watchlist_items where user_id = $1 and kind = 'counterparty'`,
    [userId]
  );
  return rows.map((r) => r.counterparty_id);
}

export async function getWatchedAdvertiserNicknames(userId: string): Promise<string[]> {
  const rows = await query<{ advertiser_nickname: string }>(
    `select advertiser_nickname from p2p_manager.watchlist_items where user_id = $1 and kind = 'advertiser'`,
    [userId]
  );
  return rows.map((r) => r.advertiser_nickname);
}

/** Every advertiser nickname ANY user has favorited - not scoped to one
 *  user_id, unlike every other function in this file. Deliberate exception:
 *  this feeds advertiser_price_history (lib/advertiserHistory.ts), a
 *  shared/public table like market_snapshots, not a per-user read - "whose
 *  favorites" doesn't apply the way it does everywhere else here. */
export async function getAllWatchedAdvertiserNicknames(): Promise<string[]> {
  const rows = await query<{ advertiser_nickname: string }>(
    `select distinct advertiser_nickname from p2p_manager.watchlist_items where kind = 'advertiser'`
  );
  return rows.map((r) => r.advertiser_nickname);
}

export async function addCounterpartyToWatchlist(userId: string, counterpartyId: string): Promise<void> {
  await query(
    `insert into p2p_manager.watchlist_items (user_id, kind, counterparty_id) values ($1, 'counterparty', $2)
     on conflict do nothing`,
    [userId, counterpartyId]
  );
}

export async function addAdvertiserToWatchlist(userId: string, nickname: string): Promise<void> {
  await query(
    `insert into p2p_manager.watchlist_items (user_id, kind, advertiser_nickname) values ($1, 'advertiser', $2)
     on conflict do nothing`,
    [userId, nickname]
  );
}

export async function removeCounterpartyFromWatchlist(userId: string, counterpartyId: string): Promise<void> {
  await query(`delete from p2p_manager.watchlist_items where user_id = $1 and kind = 'counterparty' and counterparty_id = $2`, [userId, counterpartyId]);
}

export async function removeAdvertiserFromWatchlist(userId: string, nickname: string): Promise<void> {
  await query(`delete from p2p_manager.watchlist_items where user_id = $1 and kind = 'advertiser' and advertiser_nickname = $2`, [userId, nickname]);
}
