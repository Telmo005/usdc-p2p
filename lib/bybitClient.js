const rateGate = require('./rateGate');
const fetchWithTimeout = require('./fetchWithTimeout');

const BYBIT_P2P_URL = 'https://api2.bybit.com/fiat/otc/item/online';

// Confirmed live: side "1" returns BUY-side ads (merchants selling the asset
// to you, cheapest first) and side "0" returns SELL-side ads (merchants
// buying the asset from you, priciest first) - the same orientation Binance
// uses for tradeType BUY/SELL.
const SIDE_BY_TRADE_TYPE = { BUY: '1', SELL: '0' };

/** One page of Bybit P2P ads for one side. Routed through the shared rateGate like every other platform. */
async function fetchSide({ asset, fiat, tradeType, rows = 20, priority = 'high' }, retries = 2) {
  return rateGate.schedule('bybit', async () => {
    const body = {
      userId: '',
      tokenId: asset,
      currencyId: fiat,
      payment: [],
      side: SIDE_BY_TRADE_TYPE[tradeType],
      size: String(Math.min(rows, 20)),
      page: '1',
      amount: '',
      authMaker: false,
      canTrade: false,
    };

    let res;
    try {
      res = await fetchWithTimeout(BYBIT_P2P_URL, {
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

/**
 * Normalizes a raw Bybit item into the same shape binanceClient produces.
 * Bybit doesn't expose human-readable payment names in this endpoint (only
 * numeric payment-type ids resolved client-side from a separate i18n table),
 * so payTypes carries the id as both identifier and name - callers already
 * fall back to '-' when a name isn't meaningful.
 */
function simplifyAd(item, tradeType) {
  return {
    platform: 'bybit',
    tradeType,
    advNo: item.id,
    price: Number(item.price),
    asset: item.tokenId,
    fiat: item.currencyId,
    minAmount: Number(item.minAmount),
    maxAmount: Number(item.maxAmount),
    tradableQuantity: Number(item.lastQuantity || item.quantity || 0),
    payTimeLimit: item.paymentPeriod ?? null,
    payTypes: (item.payments || []).map((id) => ({ identifier: String(id), name: null })),
    advertiser: {
      nickName: item.nickName,
      monthOrderCount: item.orderNum,
      // Bybit's own "recent execute rate" is the closest analogue to
      // Binance's monthFinishRate; fall back to a plain lifetime completion
      // ratio when that field is absent.
      monthFinishRate:
        item.recentExecuteRate != null
          ? Number(item.recentExecuteRate) / 100
          : item.orderNum ? Number(item.finishNum || 0) / Number(item.orderNum) : null,
      positiveRate: null,
    },
  };
}

async function fetchBook({ asset, fiat, rows = 20, priority = 'high' }) {
  const [buyRaw, sellRaw] = await Promise.all([
    fetchSide({ asset, fiat, tradeType: 'BUY', rows, priority }),
    fetchSide({ asset, fiat, tradeType: 'SELL', rows, priority }),
  ]);

  return {
    buy: buyRaw.map((i) => simplifyAd(i, 'BUY')),
    sell: sellRaw.map((i) => simplifyAd(i, 'SELL')),
  };
}

module.exports = { fetchBook, simplifyAd };
