/**
 * Public (unauthenticated) access to Binance's P2P ad book - the same data
 * shown on https://p2p.binance.com. No API key involved: this is what any
 * visitor sees, used here to track real, live ask/bid prices over time, and
 * to show the actual public order book on the Anúncios page (not the same
 * thing as a user's own ads, which Binance has no public API for - see
 * ads/page.tsx).
 *
 * `tradeType: 'BUY'` asks Binance "show me ads where I can buy" (i.e. other
 * people's SELL ads) - the price you'd pay right now. `tradeType: 'SELL'`
 * is the mirror: ads where I can sell, i.e. the price you'd receive.
 * Binance already sorts these by best price first.
 */
const BASE_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

// Confirmed via Binance's own live MZN order book (both trade types) - the
// only two mobile-money cash-out methods seen there. An ad offering any
// OTHER method (a bank transfer, say) lets the buyer pay straight from a
// bank balance - no cash withdrawal, no real M-Pesa/e-Mola fee for that
// trade (see hasNonMobileMoneyMethod below, and lib/mpesaFees.ts). Not
// claimed to be an exhaustive list of every mobile-money method Binance
// could ever show - just the two actually observed live.
const MOBILE_MONEY_IDENTIFIERS = new Set(['MpesaVodaphone', 'Emola']);

export type P2PAd = {
  advNo: string;
  price: number;
  minSingleTransAmount: number;
  maxSingleTransAmount: number;
  availableQuantity: number;
  payTimeLimitMinutes: number | null;
  tradeMethods: string[];
  /** True when at least one of this ad's real payment methods isn't
   *  mobile-money cash-out - the buyer has a real way to pay this specific
   *  ad without the M-Pesa/e-Mola withdrawal fee applying at all. */
  hasNonMobileMoneyMethod: boolean;
  advertiserNickname: string;
  advertiserOrderCount: number | null;
  advertiserFinishRate: number | null;
  advertiserIsMerchant: boolean;
  /** The advertiser's own terms/description, when Binance's public endpoint
   *  actually provides one - never fabricated if absent (see AdsBrowser.tsx,
   *  which shows an explicit "not provided" message rather than nothing). */
  remarks: string | null;
};

export type P2PSnapshot = {
  bestPrice: number;
  avgTopPrice: number;
  sampleSize: number;
  ads: P2PAd[];
};

type RawAdRow = {
  adv: {
    advNo: string;
    price: string;
    minSingleTransAmount: string;
    maxSingleTransAmount: string;
    tradableQuantity: string;
    payTimeLimit: number | null;
    tradeMethods: Array<{ identifier: string; tradeMethodName: string }>;
    // Not documented/guaranteed by Binance's public endpoint - read
    // defensively, never assumed present. See P2PAd.remarks.
    remarks?: string | null;
  };
  advertiser: {
    nickName: string;
    monthOrderCount: number | null;
    monthFinishRate: number | null;
    userType: string | null;
  };
};

function mapAd(row: RawAdRow): P2PAd {
  const remarks = typeof row.adv.remarks === 'string' ? row.adv.remarks.trim() : '';
  return {
    advNo: row.adv.advNo,
    price: Number(row.adv.price),
    minSingleTransAmount: Number(row.adv.minSingleTransAmount),
    maxSingleTransAmount: Number(row.adv.maxSingleTransAmount),
    availableQuantity: Number(row.adv.tradableQuantity),
    payTimeLimitMinutes: row.adv.payTimeLimit ?? null,
    tradeMethods: row.adv.tradeMethods.map((m) => m.tradeMethodName || m.identifier),
    hasNonMobileMoneyMethod: row.adv.tradeMethods.some((m) => !MOBILE_MONEY_IDENTIFIERS.has(m.identifier)),
    advertiserNickname: row.advertiser.nickName,
    advertiserOrderCount: row.advertiser.monthOrderCount,
    advertiserFinishRate: row.advertiser.monthFinishRate,
    advertiserIsMerchant: row.advertiser.userType === 'merchant',
    remarks: remarks.length > 0 ? remarks : null,
  };
}

/**
 * Fetches the top `rows` ads for one side of the book. Returns null (never
 * throws) when Binance returns no ads for this pair right now - a market
 * with zero live ads is real information, not an error, and callers decide
 * how to treat it.
 */
export async function fetchP2PSnapshot(asset: string, fiat: string, side: 'buy' | 'sell', rows = 10): Promise<P2PSnapshot | null> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: 1,
      rows,
      asset,
      fiat,
      tradeType: side.toUpperCase(),
      payTypes: [],
      publisherType: null,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Binance P2P respondeu ${res.status} para ${asset}/${fiat}/${side}`);
  }

  const json = (await res.json()) as { code: string; data: RawAdRow[] };
  const ads: P2PAd[] = (json.data ?? []).map(mapAd);

  if (ads.length === 0) return null;

  const top5 = ads.slice(0, 5);
  const avgTopPrice = top5.reduce((sum, a) => sum + a.price, 0) / top5.length;

  return { bestPrice: ads[0].price, avgTopPrice, sampleSize: ads.length, ads };
}
