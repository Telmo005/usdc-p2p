const rateGate = require('./rateGate');
const fetchWithTimeout = require('./fetchWithTimeout');

const BYBIT_ITEM_URL = 'https://api2.bybit.com/fiat/otc/item/online';
const BYBIT_PAYMENT_LIST_URL = 'https://api2.bybit.com/fiat/otc/configuration/queryAllPaymentList';

// side "1" = merchants selling (we buy from them, equivalent to Binance's BUY);
// side "0" = merchants buying (we sell to them, equivalent to Binance's SELL).
const SIDE_BY_TRADE_TYPE = { BUY: '1', SELL: '0' };

// paymentType (numeric id) -> human-readable name. Bybit's item list only
// gives numeric ids; the name mapping lives on a separate config endpoint.
// Refreshed occasionally, keeps serving the last good value on failure
// instead of breaking ad rendering.
let paymentNameCache = { map: new Map(), fetchedAt: null };
let paymentNameRefreshPromise = null;
const PAYMENT_NAME_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function refreshPaymentNames() {
  try {
    const res = await fetchWithTimeout(BYBIT_PAYMENT_LIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`Bybit payment list respondeu ${res.status}`);
    const list = res.json?.result?.paymentConfigVo || [];
    const map = new Map();
    for (const p of list) {
      if (p.paymentName) map.set(String(p.paymentType), p.paymentName);
    }
    if (map.size) paymentNameCache = { map, fetchedAt: new Date() };
  } catch (err) {
    console.error('bybitClient: falha a atualizar nomes de metodos de pagamento:', err.message);
  }
  return paymentNameCache;
}

async function ensurePaymentNames() {
  const stale = !paymentNameCache.fetchedAt || Date.now() - paymentNameCache.fetchedAt.getTime() > PAYMENT_NAME_REFRESH_INTERVAL_MS;
  if (paymentNameCache.map.size && !stale) return paymentNameCache;
  if (!paymentNameRefreshPromise) {
    paymentNameRefreshPromise = refreshPaymentNames().finally(() => {
      paymentNameRefreshPromise = null;
    });
  }
  return paymentNameRefreshPromise;
}

function paymentName(id) {
  return paymentNameCache.map.get(String(id)) || `Metodo #${id}`;
}

async function fetchSide({ asset, fiat, tradeType, rows = 20, priority = 'high' }, retries = 2) {
  return rateGate.schedule('bybit', async () => {
    const body = {
      userId: '',
      tokenId: asset,
      currencyId: fiat,
      payment: [],
      side: SIDE_BY_TRADE_TYPE[tradeType],
      size: String(rows),
      page: '1',
      amount: '',
      authMaker: false,
      canTrade: false,
    };

    let res;
    try {
      res = await fetchWithTimeout(BYBIT_ITEM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (retries > 0) return fetchSide({ asset, fiat, tradeType, rows, priority }, retries - 1);
      throw new Error(`Falha de rede a contactar a Bybit P2P: ${err.message}`);
    }

    if (!res.ok) {
      if (retries > 0) return fetchSide({ asset, fiat, tradeType, rows, priority }, retries - 1);
      throw new Error(`Bybit P2P respondeu ${res.status}`);
    }

    if (res.json.ret_code !== 0) {
      throw new Error(res.json.ret_msg || 'Bybit P2P devolveu um erro');
    }

    return res.json.result?.items || [];
  }, priority);
}

function simplifyItem(item, tradeType) {
  return {
    platform: 'bybit',
    tradeType,
    advNo: item.id,
    price: Number(item.price),
    asset: item.tokenId,
    fiat: item.currencyId,
    minAmount: Number(item.minAmount),
    maxAmount: Number(item.maxAmount),
    tradableQuantity: Number(item.lastQuantity ?? item.quantity ?? 0),
    payTimeLimit: item.paymentPeriod ?? null,
    payTypes: (item.payments || []).map((id) => ({
      identifier: String(id),
      name: paymentName(id),
    })),
    advertiser: {
      nickName: item.nickName,
      monthOrderCount: item.recentOrderNum ?? item.orderNum ?? null,
      monthFinishRate: item.recentExecuteRate != null ? Number(item.recentExecuteRate) / 100 : null,
      positiveRate: null,
    },
  };
}

async function fetchBook({ asset, fiat, rows = 20, priority = 'high' }) {
  await ensurePaymentNames();

  const [buyItems, sellItems] = await Promise.all([
    fetchSide({ asset, fiat, tradeType: 'BUY', rows, priority }),
    fetchSide({ asset, fiat, tradeType: 'SELL', rows, priority }),
  ]);

  return {
    buy: buyItems.map((i) => simplifyItem(i, 'BUY')),
    sell: sellItems.map((i) => simplifyItem(i, 'SELL')),
  };
}

module.exports = { fetchBook };
