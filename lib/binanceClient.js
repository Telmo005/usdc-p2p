const rateGate = require('./rateGate');
const fetchWithTimeout = require('./fetchWithTimeout');

const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

/**
 * Fetches one page of P2P ads directly from Binance's public (unauthenticated)
 * P2P search endpoint - the same one used by p2p.binance.com. Every call is
 * routed through the shared rateGate so concurrent callers never burst.
 */
async function fetchAdsPage({ asset, fiat, tradeType, page = 1, rows = 20, payTypes = [], priority = 'high' }, retries = 2) {
  return rateGate.schedule('binance', async () => {
    const body = {
      page,
      rows,
      payTypes,
      asset,
      tradeType, // 'BUY' or 'SELL'
      fiat,
      publisherType: null,
      merchantCheck: false,
    };

    let res;
    try {
      res = await fetchWithTimeout(BINANCE_P2P_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (retries > 0) return fetchAdsPage({ asset, fiat, tradeType, page, rows, payTypes, priority }, retries - 1);
      throw new Error(`Falha de rede a contactar a Binance P2P: ${err.message}`);
    }

    if (!res.ok) {
      if (retries > 0) return fetchAdsPage({ asset, fiat, tradeType, page, rows, payTypes, priority }, retries - 1);
      throw new Error(`Binance P2P respondeu ${res.status}`);
    }

    if (!res.json.success) {
      throw new Error(res.json.message || 'Binance P2P devolveu um erro');
    }

    return res.json.data || [];
  }, priority);
}

/** Normalizes a raw Binance ad into the shape the rest of the app consumes. */
function simplifyAd(entry, tradeType) {
  const adv = entry.adv || {};
  const advertiser = entry.advertiser || {};
  return {
    platform: 'binance',
    tradeType,
    advNo: adv.advNo,
    price: Number(adv.price),
    asset: adv.asset,
    fiat: adv.fiatUnit,
    minAmount: Number(adv.minSingleTransAmount),
    maxAmount: Number(adv.maxSingleTransAmount || adv.dynamicMaxSingleTransAmount || adv.maxSingleTransQuantity || 0),
    tradableQuantity: Number(adv.tradableQuantity || adv.surplusAmount || 0),
    payTimeLimit: adv.payTimeLimit ?? null,
    payTypes: (adv.tradeMethods || []).map((m) => ({
      identifier: m.identifier,
      name: m.tradeMethodShortName || m.tradeMethodName || m.identifier,
    })),
    advertiser: {
      nickName: advertiser.nickName,
      monthOrderCount: advertiser.monthOrderCount,
      monthFinishRate: advertiser.monthFinishRate,
      positiveRate: advertiser.positiveRate,
    },
  };
}

const MAX_PAGE_ROWS = 20; // Binance rejects any `rows` value above this per page.

/** Pages through one side (BUY or SELL) until `rows` ads are collected. */
async function fetchSideDeep({ asset, fiat, tradeType, rows, payTypes, priority }) {
  const pageCount = Math.ceil(rows / MAX_PAGE_ROWS);
  const results = [];
  for (let page = 1; page <= pageCount; page++) {
    const raw = await fetchAdsPage({ asset, fiat, tradeType, page, rows: MAX_PAGE_ROWS, payTypes, priority });
    results.push(...raw);
    if (raw.length < MAX_PAGE_ROWS) break; // reached the end of the book
  }
  return results.map((e) => simplifyAd(e, tradeType));
}

/**
 * Fetches BUY + SELL ads for a pair, already simplified. `rows` is the total
 * number of ads wanted per side - since Binance caps each page at 20, this
 * pages through as many requests as needed to satisfy it (e.g. rows:40 -> 2
 * pages), so payment methods further down the book aren't missed. `priority`
 * ('high' by default) lets background scans (the whole-platform method
 * catalog) mark themselves 'low' so they never delay the book the user is
 * actually looking at.
 */
async function fetchBook({ asset, fiat, rows = 20, payTypes = [], priority = 'high' }) {
  const [buy, sell] = await Promise.all([
    fetchSideDeep({ asset, fiat, tradeType: 'BUY', rows, payTypes, priority }),
    fetchSideDeep({ asset, fiat, tradeType: 'SELL', rows, payTypes, priority }),
  ]);

  return { buy, sell };
}

module.exports = { fetchAdsPage, fetchBook, simplifyAd };
