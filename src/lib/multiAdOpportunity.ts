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
  /** True when the winning result came from the fee-free-only candidate
   *  search below, not the full-book one - surfaced so the UI can explain
   *  why a smaller amount won (the plan never touches an M-Pesa/e-Mola-only
   *  merchant, so no withdrawal fee ever applies). */
  usedFeeFreeOnly: boolean;
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
 * `includeFees` lets the user see the full-book search with or without the
 * real M-Pesa/e-Mola withdrawal fee factored in (still only ever applied
 * for MZN); defaults to true.
 *
 * On top of that single search, for MZN this also runs a SECOND candidate
 * search restricted to genuinely fee-free buy-side ads only (real
 * non-mobile-money payment methods - the exact same flag and buy-only
 * scoping the simulator already defaults to via its own "Sem M-Pesa/
 * e-Mola" quick filter) and keeps whichever of the two produced the
 * higher real net result. This isn't optional/user-toggled: a single
 * greedy fill over the mixed full book can dilute a cheap, genuinely
 * fee-free run of ads with a slightly-cheaper-but-fee-charging one long
 * before the per-amount comparison shows it, so without this second pass
 * the search can systematically miss the smaller, fee-free-only amount
 * that's actually more profitable - exactly what a manual comparison
 * against the simulator surfaced.
 */
export async function getMultiAdOpportunities(
  costs: CapitalSettings,
  opts?: { favoriteNicknames?: string[]; includeFees?: boolean }
): Promise<MultiAdOpportunity[]> {
  const books = await Promise.all(TRACKED_PAIRS.map((p) => fetchPairBooks(p.asset, p.fiat)));
  const favoriteNicknames = opts?.favoriteNicknames;
  const includeFees = opts?.includeFees ?? true;
  const searchOpts = { minAmount: SEARCH_MIN_AMOUNT, maxAmount: SEARCH_MAX_AMOUNT, step: SEARCH_STEP };

  return books.map((b) => {
    const baseBuyAds = favoriteNicknames ? b.buyAds.filter((a) => favoriteNicknames.includes(a.advertiserNickname)) : b.buyAds;
    const sellAds = b.sellAds;

    const fullResult = findBestAmount(baseBuyAds, sellAds, costs, includeFees && b.fiat === 'MZN', searchOpts);
    let result = fullResult;
    let buyAdsCount = baseBuyAds.length;
    let usedFeeFreeOnly = false;

    if (b.fiat === 'MZN') {
      const feeFreeBuyAds = baseBuyAds.filter((a) => a.hasNonMobileMoneyMethod);
      if (feeFreeBuyAds.length > 0) {
        const feeFreeResult = findBestAmount(feeFreeBuyAds, sellAds, costs, false, searchOpts);
        if (feeFreeResult.bestPlan.netResult > result.bestPlan.netResult) {
          result = feeFreeResult;
          buyAdsCount = feeFreeBuyAds.length;
          usedFeeFreeOnly = true;
        }
      }
    }

    return {
      asset: b.asset,
      fiat: b.fiat,
      result,
      booksFetchedAt: b.fetchedAt,
      buyAdsCount,
      sellAdsCount: sellAds.length,
      usedFeeFreeOnly,
    };
  });
}
