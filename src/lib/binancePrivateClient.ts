import crypto from 'node:crypto';

/**
 * Signed, read-only access to Binance's real C2C order history
 * (GET /sapi/v1/c2c/orderMatch/listUserOrderHistory). Never places, cancels,
 * or modifies anything - by design (see spec section 71: this app manages
 * and analyzes, it never trades automatically).
 */
const BASE_URL = 'https://api.binance.com';

export type BinanceC2COrder = {
  orderNumber: string;
  advNo: string;
  tradeType: 'BUY' | 'SELL';
  asset: string;
  fiat: string;
  fiatSymbol: string;
  amount: string; // asset quantity
  totalPrice: string; // fiat total
  unitPrice: string;
  orderStatus: string;
  createTime: number;
  commission: string;
  counterPartNickName: string;
  payType?: string;
};

function sign(query: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

function buildSignedQuery(params: Record<string, string | number>, apiSecret: string): string {
  const query = new URLSearchParams({ ...params, timestamp: String(Date.now()), recvWindow: '10000' } as Record<string, string>);
  const signature = sign(query.toString(), apiSecret);
  query.set('signature', signature);
  return query.toString();
}

function requireCreds() {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error('BINANCE_API_KEY/BINANCE_API_SECRET não configuradas.');
  return { apiKey, apiSecret };
}

async function signedGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const { apiKey, apiSecret } = requireCreds();
  const qs = buildSignedQuery(params, apiSecret);

  const res = await fetch(`${BASE_URL}${path}?${qs}`, {
    headers: { 'X-MBX-APIKEY': apiKey },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Binance respondeu ${res.status}: ${body.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

/** Same signing scheme as signedGet, but POST - a handful of read-only
 *  endpoints (funding wallet balance included) only accept POST. */
async function signedPost<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const { apiKey, apiSecret } = requireCreds();
  const qs = buildSignedQuery(params, apiSecret);

  const res = await fetch(`${BASE_URL}${path}?${qs}`, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': apiKey },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Binance respondeu ${res.status}: ${body.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

/**
 * One page of the user's real C2C order history. `tradeType` must be
 * queried separately for BUY and SELL - Binance's API doesn't support "both"
 * in one call.
 */
export async function fetchC2COrderHistory(tradeType: 'BUY' | 'SELL', page = 1, rows = 100): Promise<BinanceC2COrder[]> {
  const result = await signedGet<{ code: string; data: BinanceC2COrder[] }>('/sapi/v1/c2c/orderMatch/listUserOrderHistory', {
    tradeType,
    page,
    rows,
  });
  return result.data ?? [];
}

/** Fetches every page of both trade types - Binance caps at 100 rows/page. */
export async function fetchAllC2COrders(): Promise<BinanceC2COrder[]> {
  const all: BinanceC2COrder[] = [];
  for (const tradeType of ['BUY', 'SELL'] as const) {
    for (let page = 1; page <= 20; page++) {
      const batch = await fetchC2COrderHistory(tradeType, page, 100);
      all.push(...batch);
      if (batch.length < 100) break;
    }
  }
  return all;
}

export type BinanceBalance = { asset: string; free: number; locked: number };

/**
 * The account's real live Spot wallet balances (GET /api/v3/account) -
 * "Enable Reading" alone covers this, no trading permission needed. Only
 * non-zero balances are returned.
 */
export async function fetchSpotBalances(): Promise<BinanceBalance[]> {
  const result = await signedGet<{ balances: Array<{ asset: string; free: string; locked: string }> }>('/api/v3/account', {});
  return (result.balances ?? [])
    .map((b) => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked) }))
    .filter((b) => b.free > 0 || b.locked > 0);
}

/**
 * The account's Funding wallet (POST /sapi/v1/asset/get-funding-asset) -
 * this is where Binance actually settles completed P2P trades by default,
 * separate from Spot. Missing this was why the balance shown here didn't
 * match the total in the Binance app.
 */
export async function fetchFundingBalances(): Promise<BinanceBalance[]> {
  const result = await signedPost<Array<{ asset: string; free: string; locked: string; freeze: string; withdrawing: string }>>(
    '/sapi/v1/asset/get-funding-asset',
    {}
  );
  return (result ?? [])
    .map((b) => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked) + Number(b.freeze) + Number(b.withdrawing) }))
    .filter((b) => b.free > 0 || b.locked > 0);
}

export type BinanceEarnPosition = {
  asset: string;
  totalAmount: number;
  latestApr: number;
  cumulativeRewards: number;
  canRedeem: boolean;
};

/**
 * Simple Earn Flexible positions (GET /sapi/v1/simple-earn/flexible/position)
 * - this is where the LD-prefixed tokens in Spot come from; surfaced on its
 * own here so the APY/rewards this account is actually earning are visible
 * instead of folded anonymously into a Spot balance line.
 */
export async function fetchEarnPositions(): Promise<BinanceEarnPosition[]> {
  const result = await signedGet<{
    rows: Array<{ asset: string; totalAmount: string; latestAnnualPercentageRate: string; cumulativeTotalRewards: string; canRedeem: boolean }>;
  }>('/sapi/v1/simple-earn/flexible/position', {});
  return (result.rows ?? []).map((r) => ({
    asset: r.asset,
    totalAmount: Number(r.totalAmount),
    latestApr: Number(r.latestAnnualPercentageRate),
    cumulativeRewards: Number(r.cumulativeTotalRewards),
    canRedeem: r.canRedeem,
  }));
}
