const rateGate = require('./rateGate');
const fetchWithTimeout = require('./fetchWithTimeout');

const OKX_BOOKS_URL = 'https://www.okx.com/v3/c2c/tradingOrders/books';

// OKX's "sell" side = merchants selling (we buy from them, Binance's BUY);
// "buy" side = merchants buying (we sell to them, Binance's SELL).
const SIDE_BY_TRADE_TYPE = { BUY: 'sell', SELL: 'buy' };

async function fetchSide({ asset, fiat, tradeType, rows = 20, priority = 'high' }, retries = 2) {
  return rateGate.schedule('okx', async () => {
    const qs = new URLSearchParams({
      side: SIDE_BY_TRADE_TYPE[tradeType],
      baseCurrency: asset.toLowerCase(),
      quoteCurrency: fiat.toLowerCase(),
      paymentMethod: 'all',
      userType: 'all',
      showTrade: 'false',
      isAbleFilter: 'false',
    });

    let res;
    try {
      res = await fetchWithTimeout(`${OKX_BOOKS_URL}?${qs.toString()}`);
    } catch (err) {
      if (retries > 0) return fetchSide({ asset, fiat, tradeType, rows, priority }, retries - 1);
      throw new Error(`Falha de rede a contactar a OKX P2P: ${err.message}`);
    }

    if (!res.ok) {
      if (retries > 0) return fetchSide({ asset, fiat, tradeType, rows, priority }, retries - 1);
      throw new Error(`OKX P2P respondeu ${res.status}`);
    }

    if (res.json.code !== 0) {
      throw new Error(res.json.msg || res.json.detailMsg || 'OKX P2P devolveu um erro');
    }

    const items = tradeType === 'BUY' ? res.json.data?.sell : res.json.data?.buy;
    return (items || []).slice(0, rows);
  }, priority);
}

function simplifyItem(item, tradeType) {
  return {
    platform: 'okx',
    tradeType,
    advNo: item.id,
    price: Number(item.price),
    asset: (item.baseCurrency || '').toUpperCase(),
    fiat: (item.quoteCurrency || '').toUpperCase(),
    minAmount: Number(item.quoteMinAmountPerOrder),
    maxAmount: Number(item.quoteMaxAmountPerOrder),
    tradableQuantity: Number(item.availableAmount ?? 0),
    payTimeLimit: item.paymentTimeoutMinutes ?? null,
    payTypes: (item.paymentMethods || []).map((name) => ({
      identifier: name,
      name,
    })),
    advertiser: {
      nickName: item.nickName,
      monthOrderCount: item.completedOrderQuantity ?? null,
      monthFinishRate: item.completedRate != null ? Number(item.completedRate) : null,
      positiveRate: null,
    },
  };
}

async function fetchBook({ asset, fiat, rows = 20, priority = 'high' }) {
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
