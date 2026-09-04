const rateGate = require('./rateGate');
const fetchWithTimeout = require('./fetchWithTimeout');

const OKX_P2P_URL = 'https://www.okx.com/v3/c2c/tradingOrders/books';

// Confirmed live against real prices: OKX's `side` param names the AD
// CREATOR's side, not the taker's - "side=sell" lists merchants selling the
// asset (what you'd pay to BUY), "side=buy" lists merchants buying the asset
// (what you'd receive to SELL). Verified by spread direction: sell-side
// prices consistently sit above buy-side prices for the same pair, as
// expected of an ask > bid spread.
const SIDE_BY_TRADE_TYPE = { BUY: 'sell', SELL: 'buy' };

async function fetchSide({ asset, fiat, tradeType, priority = 'high' }, retries = 2) {
  return rateGate.schedule('okx', async () => {
    const params = new URLSearchParams({
      t: String(Date.now()),
      quoteCurrency: fiat,
      baseCurrency: asset,
      side: SIDE_BY_TRADE_TYPE[tradeType],
      paymentMethod: 'all',
      userType: 'all',
      showTrade: 'false',
      showFollow: 'false',
      showAlreadyTraded: 'false',
      isAbleFilterMerchantBlocked: 'false',
      isFollowed: 'false',
    });

    let res;
    try {
      res = await fetchWithTimeout(`${OKX_P2P_URL}?${params}`, { headers: { Accept: 'application/json' } });
    } catch (err) {
      if (retries > 0) return fetchSide({ asset, fiat, tradeType, priority }, retries - 1);
      throw new Error(`Falha de rede a contactar a OKX P2P: ${err.message}`);
    }

    if (!res.ok) {
      if (retries > 0) return fetchSide({ asset, fiat, tradeType, priority }, retries - 1);
      throw new Error(`OKX P2P respondeu ${res.status}`);
    }

    if (res.json.code !== 0) {
      throw new Error(res.json.msg || 'OKX P2P devolveu um erro');
    }

    const key = SIDE_BY_TRADE_TYPE[tradeType]; // response buckets ads under the same key as the request side
    return res.json.data?.[key] || [];
  }, priority);
}

/** Normalizes a raw OKX ad into the same shape binanceClient produces. */
function simplifyAd(item, tradeType) {
  return {
    platform: 'okx',
    tradeType,
    advNo: item.id,
    price: Number(item.price),
    asset: (item.baseCurrency || '').toUpperCase(),
    fiat: (item.quoteCurrency || '').toUpperCase(),
    minAmount: Number(item.quoteMinAmountPerOrder),
    maxAmount: Number(item.quoteMaxAmountPerOrder),
    tradableQuantity: Number(item.availableAmount || 0),
    payTimeLimit: item.paymentTimeoutMinutes ?? null,
    payTypes: (item.paymentMethods || []).map((name) => ({ identifier: name, name: name.replace(/(^|[\s_-])(\w)/g, (m, sep, c) => sep + c.toUpperCase()) })),
    advertiser: {
      nickName: item.nickName,
      monthOrderCount: item.completedOrderQuantity,
      monthFinishRate: item.completedRate != null ? Number(item.completedRate) : null,
      positiveRate: null,
    },
  };
}

async function fetchBook({ asset, fiat, priority = 'high' }) {
  const [buyRaw, sellRaw] = await Promise.all([
    fetchSide({ asset, fiat, tradeType: 'BUY', priority }),
    fetchSide({ asset, fiat, tradeType: 'SELL', priority }),
  ]);

  return {
    buy: buyRaw.map((i) => simplifyAd(i, 'BUY')),
    sell: sellRaw.map((i) => simplifyAd(i, 'SELL')),
  };
}

module.exports = { fetchBook, simplifyAd };
