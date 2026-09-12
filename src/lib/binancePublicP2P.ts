/**
 * Public (unauthenticated) access to Binance's P2P ad book - the same data
 * shown on https://p2p.binance.com. No API key involved: this is what any
 * visitor sees, used here to track real, live ask/bid prices over time.
 *
 * `tradeType: 'BUY'` asks Binance "show me ads where I can buy" (i.e. other
 * people's SELL ads) - the price you'd pay right now. `tradeType: 'SELL'`
 * is the mirror: ads where I can sell, i.e. the price you'd receive.
 * Binance already sorts these by best price first.
 */
const BASE_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

export type P2PAd = {
  price: number;
  minSingleTransAmount: number;
  maxSingleTransAmount: number;
  tradeMethods: string[];
};

export type P2PSnapshot = {
  bestPrice: number;
  avgTopPrice: number;
  sampleSize: number;
  ads: P2PAd[];
};

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

  const json = (await res.json()) as { code: string; data: Array<{ adv: { price: string; minSingleTransAmount: string; maxSingleTransAmount: string; tradeMethods: Array<{ identifier: string }> } }> };

  const ads: P2PAd[] = (json.data ?? []).map((row) => ({
    price: Number(row.adv.price),
    minSingleTransAmount: Number(row.adv.minSingleTransAmount),
    maxSingleTransAmount: Number(row.adv.maxSingleTransAmount),
    tradeMethods: row.adv.tradeMethods.map((m) => m.identifier),
  }));

  if (ads.length === 0) return null;

  const top5 = ads.slice(0, 5);
  const avgTopPrice = top5.reduce((sum, a) => sum + a.price, 0) / top5.length;

  return { bestPrice: ads[0].price, avgTopPrice, sampleSize: ads.length, ads };
}
