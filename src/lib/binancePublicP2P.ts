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

export type P2PAd = {
  advNo: string;
  price: number;
  minSingleTransAmount: number;
  maxSingleTransAmount: number;
  availableQuantity: number;
  payTimeLimitMinutes: number | null;
  tradeMethods: string[];
  advertiserNickname: string;
  advertiserOrderCount: number | null;
  advertiserFinishRate: number | null;
  advertiserIsMerchant: boolean;
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
  };
  advertiser: {
    nickName: string;
    monthOrderCount: number | null;
    monthFinishRate: number | null;
    userType: string | null;
  };
};

function mapAd(row: RawAdRow): P2PAd {
  return {
    advNo: row.adv.advNo,
    price: Number(row.adv.price),
    minSingleTransAmount: Number(row.adv.minSingleTransAmount),
    maxSingleTransAmount: Number(row.adv.maxSingleTransAmount),
    availableQuantity: Number(row.adv.tradableQuantity),
    payTimeLimitMinutes: row.adv.payTimeLimit ?? null,
    tradeMethods: row.adv.tradeMethods.map((m) => m.tradeMethodName || m.identifier),
    advertiserNickname: row.advertiser.nickName,
    advertiserOrderCount: row.advertiser.monthOrderCount,
    advertiserFinishRate: row.advertiser.monthFinishRate,
    advertiserIsMerchant: row.advertiser.userType === 'merchant',
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
