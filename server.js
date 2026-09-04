const express = require('express');
const path = require('path');
const compression = require('compression');
const binance = require('./lib/binanceClient');
const bybit = require('./lib/bybitClient');
const okx = require('./lib/okxClient');
const cache = require('./lib/cache');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));

const PLATFORM_NAMES = { binance: 'Binance', bybit: 'Bybit', okx: 'OKX' };

// Ads from advertisers with a poor track record are excluded - no point
// recommending a trade that's likely to stall or get cancelled.
function isReputable(ad) {
  const fr = ad.advertiser?.monthFinishRate;
  const pr = ad.advertiser?.positiveRate;
  return (fr == null || fr >= 0.8) && (pr == null || pr >= 0.9);
}

/**
 * Merging several exchanges into one order book means the very best price is
 * no longer necessarily a real, liquid one - a thin/exotic market can carry a
 * lone advance-fee-scam ad priced far better than the rest (verified live: a
 * Bybit ZAR ad at ~15% below every other reputable ad, remark pushing
 * off-platform Telegram/Western Union payment - a classic pattern). Reputable
 * ads alone don't catch this, since a scam ad can still show a clean
 * completion history. So beyond reputation, any ad priced more than
 * OUTLIER_BAND away from the median of the reputable set is dropped before
 * picking a winner. Genuine cross-exchange arbitrage spreads are a few
 * percent at most; this only filters the "too good to be true" tail.
 * Skipped when there's too little data (<3 ads) to trust a median.
 */
const OUTLIER_BAND = 0.12;

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function dropPriceOutliers(ads, side) {
  if (ads.length < 3) return ads;
  const m = median(ads.map((ad) => ad.price));
  return ads.filter((ad) => (side === 'buy' ? ad.price >= m * (1 - OUTLIER_BAND) : ad.price <= m * (1 + OUTLIER_BAND)));
}

/** Does buying with `fiatAmount` actually work against this ad's own size limits? */
function fitsBuy(ad, fiatAmount) {
  if (fiatAmount < ad.minAmount || fiatAmount > ad.maxAmount) return false;
  if (ad.tradableQuantity && fiatAmount / ad.price > ad.tradableQuantity) return false;
  return true;
}

/** Does selling `qty` (base asset units) actually work against this ad's own size limits? */
function fitsSell(ad, qty) {
  if (ad.tradableQuantity && qty > ad.tradableQuantity) return false;
  const proceeds = qty * ad.price;
  return proceeds >= ad.minAmount && proceeds <= ad.maxAmount;
}

/**
 * Best reputable, non-outlier ad for a side: cheapest if buying, priciest if
 * selling. `methods`, if given (one name or an array of them), restricts to
 * ads offering ANY of them - e.g. "aceito M-Pesa ou e-Mola" should widen the
 * pool of usable ads, not narrow it to a single wallet. `fitCheck(ad)`, if
 * given, is preferred: among several exchanges the very best price is often a
 * tiny, thin-liquidity ad that can't actually absorb this trade's size -
 * picking it anyway would silently cap the leg's proceeds at whatever
 * fraction the ad can fill, producing a nonsense result. When nothing fits,
 * this still falls back to the best price overall (unchanged legacy
 * behavior) so a genuinely undersized trade still sees the closest real
 * quote, flagged via legInfo(...).fits, rather than a hard error.
 */
function bestAd(ads, side, methods, fitCheck) {
  const wanted = Array.isArray(methods) ? methods : methods ? [methods] : [];
  const candidates = wanted.length ? ads.filter((ad) => ad.payTypes.some((pt) => wanted.includes(pt.name))) : ads;
  const reputable = dropPriceOutliers(candidates.filter(isReputable), side);
  if (!reputable.length) return null;
  const sorted = side === 'buy' ? reputable.sort((a, b) => a.price - b.price) : reputable.sort((a, b) => b.price - a.price);
  if (fitCheck) {
    const fitting = sorted.find(fitCheck);
    if (fitting) return fitting;
  }
  return sorted[0];
}

function legInfo(ad, amountInThisLeg) {
  return {
    price: ad.price,
    advertiser: ad.advertiser.nickName,
    method: ad.payTypes[0]?.name ?? null,
    platform: PLATFORM_NAMES[ad.platform] || ad.platform,
    minAmount: ad.minAmount,
    maxAmount: ad.maxAmount,
    fits: amountInThisLeg >= ad.minAmount && amountInThisLeg <= ad.maxAmount,
  };
}

const BOOK_CACHE_TTL_MS = 10_000;

/**
 * USDT book for one fiat, merged across every supported exchange (currently
 * Binance, Bybit, OKX), cached + single-flight so a 20s auto-refresh never
 * duplicates a request. One exchange failing (rate limit, timeout, an
 * unsupported fiat on that platform) never breaks the whole book - it's
 * simply excluded from that fetch, since Binance alone already served this
 * app reliably before the others were added.
 */
function getUsdtBook(fiat) {
  return cache.getOrFetch(
    `book:multi:USDT:${fiat}`,
    async () => {
      const results = await Promise.allSettled([
        binance.fetchBook({ asset: 'USDT', fiat, rows: 20 }),
        bybit.fetchBook({ asset: 'USDT', fiat, rows: 20 }),
        okx.fetchBook({ asset: 'USDT', fiat }),
      ]);

      const merged = { buy: [], sell: [] };
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        merged.buy.push(...r.value.buy);
        merged.sell.push(...r.value.sell);
      }

      if (!merged.buy.length && !merged.sell.length) {
        const firstError = results.find((r) => r.status === 'rejected');
        throw firstError ? firstError.reason : new Error('Nenhuma exchange devolveu anúncios.');
      }

      return merged;
    },
    BOOK_CACHE_TTL_MS
  );
}

/**
 * A full round trip: start with `balance` in `startFiat`, buy USDT, sell that
 * USDT for `midFiat`, then immediately buy USDT again with THOSE exact
 * proceeds, and sell that back for `startFiat`. The final amount is directly
 * comparable to the balance you started with - same currency, no reference
 * exchange rate needed, no approximation. Two ordered legs, one real number.
 */
/** Formats a method filter (a name, an array of names, or none) for an error message. */
function fmtMethod(method) {
  const names = Array.isArray(method) ? method : method ? [method] : [];
  return names.length ? ` via ${names.join(' ou ')}` : '';
}

function computeCycle({ startFiat, midFiat, balance, startBuyAds, midSellAds, midBuyAds, startSellAds, startMethod, midMethod }) {
  const base = { startFiat, midFiat, balance };

  // Each ad is picked in order, size-aware against the amount THAT specific
  // hop actually carries - buyA against the starting balance, sellA against
  // however much USDT buyA's own price and capacity yielded, and so on. That
  // amount only exists once the previous hop is resolved, so the two legs of
  // each conversion can no longer be picked independently/concurrently.
  const buyA = bestAd(startBuyAds, 'buy', startMethod, (ad) => fitsBuy(ad, balance));
  if (!buyA) {
    return { ...base, error: `Sem anúncios para comprar em ${startFiat}${fmtMethod(startMethod)} agora.` };
  }
  const qtyA = Math.min(balance / buyA.price, buyA.tradableQuantity || Infinity);

  const sellA = bestAd(midSellAds, 'sell', midMethod, (ad) => fitsSell(ad, qtyA));
  if (!sellA) {
    return { ...base, error: `Sem anúncios para vender em ${midFiat}${fmtMethod(midMethod)} agora.` };
  }
  const midAmount = qtyA * sellA.price; // now holding this much in midFiat
  const legA = { buy: legInfo(buyA, balance), sell: legInfo(sellA, midAmount), qty: qtyA, proceeds: midAmount };

  const buyB = bestAd(midBuyAds, 'buy', midMethod, (ad) => fitsBuy(ad, midAmount));
  if (!buyB) {
    return { ...base, legA, error: `Sem anúncios para comprar em ${midFiat}${fmtMethod(midMethod)}, para fechar o ciclo.` };
  }
  const qtyB = Math.min(midAmount / buyB.price, buyB.tradableQuantity || Infinity);

  const sellB = bestAd(startSellAds, 'sell', startMethod, (ad) => fitsSell(ad, qtyB));
  if (!sellB) {
    return { ...base, legA, error: `Sem anúncios para vender em ${startFiat}${fmtMethod(startMethod)}, para fechar o ciclo.` };
  }
  const finalAmount = qtyB * sellB.price; // back in startFiat

  const legB = { buy: legInfo(buyB, midAmount), sell: legInfo(sellB, finalAmount), qty: qtyB, proceeds: finalAmount };

  const profit = finalAmount - balance;
  const profitPct = balance > 0 ? (profit / balance) * 100 : null;

  return { ...base, legA, legB, finalAmount, profit, profitPct };
}

const DEFAULT_FIATS = ['MZN', 'ZAR', 'USD', 'EUR', 'GBP', 'KES', 'NGN', 'BRL'];

app.get('/api/defaults', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ fiats: DEFAULT_FIATS });
});

// Real payment methods seen right now in this fiat's live ads - never a
// fixed/guessed list, so the dropdown can never offer a wallet/method that
// doesn't actually exist there (e.g. Dukascopy only shows up for EUR).
app.get('/api/methods', async (req, res) => {
  try {
    const fiat = String(req.query.fiat || '').toUpperCase();
    if (!fiat) return res.status(400).json({ error: 'Indica uma moeda.' });

    const book = await getUsdtBook(fiat);
    const names = new Set();
    [...book.buy, ...book.sell].forEach((ad) => ad.payTypes.forEach((pt) => pt.name && names.add(pt.name)));

    res.json({ fiat, methods: [...names].sort((a, b) => a.localeCompare(b, 'pt')) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// The one thing this app does: the real, single closed loop -
// fiatA -> USDT -> fiatB -> USDT -> fiatA (or the same loop entered from the
// fiatB side) - with a chained number (leg 2 uses leg 1's actual proceeds,
// not an independent estimate), so you see exactly whether going all the way
// around leaves you ahead or behind. Any two fiats Binance P2P lists work,
// not just MZN/ZAR - that pair is only the default.
app.get('/api/corridor', async (req, res) => {
  try {
    const balance = Number(req.query.balance);
    if (!balance || balance <= 0) {
      return res.status(400).json({ error: 'Indica um saldo válido.' });
    }

    const fiatA = String(req.query.fiatA || 'MZN').toUpperCase();
    const fiatB = String(req.query.fiatB || 'ZAR').toUpperCase();
    const start = req.query.start === fiatB ? fiatB : fiatA;
    const mid = start === fiatA ? fiatB : fiatA;

    // Each fiat carries its own optional wallet/payment-method filter (e.g.
    // "Dukascopy" only ever applies to EUR-side legs) - map from A/B onto
    // whichever of start/mid that fiat actually is this time. Comma-separated
    // so several wallets can be accepted at once ("M-Pesa ou e-Mola").
    const parseMethods = (raw) => (raw ? String(raw).split(',').map((s) => s.trim()).filter(Boolean) : []);
    const methodA = parseMethods(req.query.methodA);
    const methodB = parseMethods(req.query.methodB);
    const startMethod = start === fiatA ? methodA : methodB;
    const midMethod = start === fiatA ? methodB : methodA;

    const [bookA, bookB] = await Promise.all([getUsdtBook(fiatA), getUsdtBook(fiatB)]);
    const startBook = start === fiatA ? bookA : bookB;
    const midBook = start === fiatA ? bookB : bookA;

    const cycle = computeCycle({
      startFiat: start,
      midFiat: mid,
      balance,
      startBuyAds: startBook.buy,
      midSellAds: midBook.sell,
      midBuyAds: midBook.buy,
      startSellAds: startBook.sell,
      startMethod,
      midMethod,
    });

    res.json({ generatedAt: new Date().toISOString(), cycle });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Vercel imports this file as a serverless function (it calls the exported
// app directly per-request) rather than running it as a long-lived process,
// so `app.listen()` only makes sense for local dev / `npm start`.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Ciclo P2P via USDT a correr em http://localhost:${PORT}`);
  });
}

module.exports = app;
