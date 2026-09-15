import { fetchFullP2POrderBook, type P2PAd } from '@/lib/binancePublicP2P';
import { TRACKED_PAIRS } from '@/lib/marketAnalysis';
import { findBestAmount, type OptimizationResult } from '@/lib/orderBookSimulator';
import type { CapitalSettings } from '@/lib/capitalSettings';

export type PairBooks = {
  asset: string;
  fiat: string;
  buyAds: P2PAd[];
  sellAds: P2PAd[];
  fetchedAt: number;
  /** Null on a normal fetch. On a real Binance/network failure this carries
   *  the real error message instead of silently coming back as "zero ads" -
   *  an initial page load can reasonably treat empty as "no ads posted,"
   *  but a manual refresh (Phase 17) must never let a transient failure look
   *  like the market went empty, so callers that replace existing data must
   *  check this first. */
  error: string | null;
};

/** Real individual ads (not the aggregate avg_top_price) for both legs of
 *  one pair - shared by the manual multi-ad simulator (Simulação) and the
 *  auto-search engine below (Oportunidades), so both price against the
 *  exact same live book. Paginates through the real full order book
 *  (fetchFullP2POrderBook), not just the first 20 - a merchant search
 *  worth trusting has to see everyone actually posting, not a sample. */
export async function fetchPairBooks(asset: string, fiat: string): Promise<PairBooks> {
  const fetchedAt = Date.now();
  try {
    const [buySnap, sellSnap] = await Promise.all([fetchFullP2POrderBook(asset, fiat, 'buy'), fetchFullP2POrderBook(asset, fiat, 'sell')]);
    return { asset, fiat, buyAds: buySnap?.ads ?? [], sellAds: sellSnap?.ads ?? [], fetchedAt, error: null };
  } catch (err) {
    return { asset, fiat, buyAds: [], sellAds: [], fetchedAt, error: err instanceof Error ? err.message : 'Falha ao ler o mercado.' };
  }
}

export type MultiAdOpportunity = {
  asset: string;
  fiat: string;
  result: OptimizationResult;
  booksFetchedAt: number;
  buyAdsCount: number;
  sellAdsCount: number;
};

const SEARCH_MIN_AMOUNT = 600;
const SEARCH_MAX_AMOUNT = 30_000;
const SEARCH_STEP = 1;

/**
 * "Simular eh uma coisa, encontrar o valor ideal eh procurar
 * oportunidades" - this is the search engine (Phase 10/11's
 * findBestAmount) moved out of the manual Simulação tool and into the
 * Opportunity Center, where "the system searches and tells you what it
 * found" belongs. Runs the real 600->30 000 MZN sweep (step 1, every
 * value, never skipped) against the live order book for every tracked
 * pair - one entry per pair regardless of outcome; callers decide whether
 * to show it (only ever surface a POSITIVE net result as a recommendation
 * - see OptimizationResult.isProfitable).
 *
 * `favoriteNicknames`, when given, restricts the search to only those
 * real advertisers - "só trabalhar com favoritos." Like the manual
 * multi-ad simulator's own quick filters, this only ever narrows the BUY
 * leg: the seller isn't someone you need to trust or who charges you a
 * cash-out fee, so the sell side always searches the full real market
 * (previously this filtered both legs - a real inconsistency with the
 * simulator's own "os filtros devem ser apenas para compra" rule, and one
 * that silently starved the sell side of liquidity whenever a favorited
 * merchant wasn't currently selling).
 *
 * `includeFees` lets the user see the search with or without the real
 * M-Pesa/e-Mola withdrawal fee factored in (still only ever applied for
 * MZN); defaults to true. "Favoritos" is the only restriction dimension
 * this search has - there is deliberately no separate fee-free-merchant
 * filter/candidate here, matching the manual simulator's own single
 * "Só favoritos" quick filter.
 */
export async function getMultiAdOpportunities(
  costs: CapitalSettings,
  opts?: { favoriteNicknames?: string[]; includeFees?: boolean }
): Promise<MultiAdOpportunity[]> {
  const books = await Promise.all(TRACKED_PAIRS.map((p) => fetchPairBooks(p.asset, p.fiat)));
  const favoriteNicknames = opts?.favoriteNicknames;
  const includeFees = opts?.includeFees ?? true;

  return books.map((b) => {
    const buyAds = favoriteNicknames ? b.buyAds.filter((a) => favoriteNicknames.includes(a.advertiserNickname)) : b.buyAds;
    const sellAds = b.sellAds;
    const result = findBestAmount(buyAds, sellAds, costs, includeFees && b.fiat === 'MZN', {
      minAmount: SEARCH_MIN_AMOUNT,
      maxAmount: SEARCH_MAX_AMOUNT,
      step: SEARCH_STEP,
    });
    return {
      asset: b.asset,
      fiat: b.fiat,
      result,
      booksFetchedAt: b.fetchedAt,
      buyAdsCount: buyAds.length,
      sellAdsCount: sellAds.length,
    };
  });
}
