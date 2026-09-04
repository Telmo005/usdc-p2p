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
const PLATFORM_CLIENTS = { binance, bybit, okx };
const ALL_PLATFORM_IDS = Object.keys(PLATFORM_CLIENTS);

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
 * Every reputable, non-outlier ad for a side, ranked best-first (cheapest if
 * buying, priciest if selling). `methods`, if given (one name or an array of
 * them), restricts to ads offering ANY of them - e.g. "aceito M-Pesa ou
 * e-Mola" should widen the pool of usable ads, not narrow it to a single
 * wallet. Exposed as a ranked list (not just the single winner) so the UI can
 * offer manual alternatives instead of only ever trusting the automatic pick.
 */
function rankAds(ads, side, methods) {
  const wanted = Array.isArray(methods) ? methods : methods ? [methods] : [];
  const candidates = wanted.length ? ads.filter((ad) => ad.payTypes.some((pt) => wanted.includes(pt.name))) : ads;
  const reputable = dropPriceOutliers(candidates.filter(isReputable), side);
  return side === 'buy' ? reputable.sort((a, b) => a.price - b.price) : reputable.sort((a, b) => b.price - a.price);
}

/**
 * Picks from an already-ranked list. `pin`, if given ({platform, advNo}),
 * wins whenever that exact ad is still present in `ranked` - an explicit
 * manual choice from a past request should stick until it genuinely
 * disappears from the book, not get silently overridden by a fresher
 * automatic pick. `fitCheck(ad)`, if given, is preferred over the raw best
 * price when there's no pin: among several exchanges the very best price is
 * often a tiny, thin-liquidity ad that can't actually absorb this trade's
 * size - picking it anyway would silently cap the leg's proceeds at whatever
 * fraction the ad can fill, producing a nonsense result. When nothing fits,
 * this still falls back to the best price overall (unchanged legacy
 * behavior) so a genuinely undersized trade still sees the closest real
 * quote, flagged via legInfo(...).fits, rather than a hard error.
 */
function matchesPin(ad, pin) {
  return !!pin && ad.platform === pin.platform && String(ad.advNo) === String(pin.advNo);
}

function pickAd(ranked, fitCheck, pin) {
  if (!ranked.length) return null;
  if (pin) {
    const pinned = ranked.find((ad) => matchesPin(ad, pin));
    if (pinned) return pinned;
  }
  if (fitCheck) {
    const fitting = ranked.find(fitCheck);
    if (fitting) return fitting;
  }
  return ranked[0];
}

/** Best reputable, non-outlier ad for a side - convenience wrapper over rankAds()+pickAd() for callers that don't need the full ranked list (e.g. /api/methods). */
function bestAd(ads, side, methods, fitCheck) {
  return pickAd(rankAds(ads, side, methods), fitCheck);
}

/** A small, UI-ready summary of one candidate ad - just enough to render a picker row and to re-identify it later via a pin. */
function candidateInfo(ad) {
  return {
    platform: ad.platform,
    platformName: PLATFORM_NAMES[ad.platform] || ad.platform,
    advNo: ad.advNo,
    price: ad.price,
    advertiser: ad.advertiser.nickName,
    method: ad.payTypes[0]?.name ?? null,
    minAmount: ad.minAmount,
    maxAmount: ad.maxAmount,
  };
}

const MAX_CANDIDATES = 8;

function legInfo(ad, amountInThisLeg, ranked, isPinned) {
  return {
    price: ad.price,
    advertiser: ad.advertiser.nickName,
    method: ad.payTypes[0]?.name ?? null,
    platform: PLATFORM_NAMES[ad.platform] || ad.platform,
    platformId: ad.platform,
    advNo: ad.advNo,
    minAmount: ad.minAmount,
    maxAmount: ad.maxAmount,
    fits: amountInThisLeg >= ad.minAmount && amountInThisLeg <= ad.maxAmount,
    manual: !!isPinned,
    candidates: (ranked || []).slice(0, MAX_CANDIDATES).map(candidateInfo),
  };
}

const BOOK_CACHE_TTL_MS = 10_000;

/** One exchange's USDT book for one fiat, cached + single-flight per platform - so filtering to a subset of exchanges never throws away another request's cached data for the rest. */
function getPlatformBook(platformId, fiat) {
  return cache.getOrFetch(
    `book:${platformId}:USDT:${fiat}`,
    () => PLATFORM_CLIENTS[platformId].fetchBook({ asset: 'USDT', fiat, rows: 20 }),
    BOOK_CACHE_TTL_MS
  );
}

/**
 * USDT book for one fiat, merged across whichever exchanges are wanted
 * (`exchanges`: an array of platform ids, or empty/omitted for all of them -
 * never zero, an unrecognized or empty list still falls back to every
 * platform). One exchange failing (rate limit, timeout, an unsupported fiat
 * on that platform) never breaks the whole book - it's simply excluded from
 * that fetch, since Binance alone already served this app reliably before
 * the others were added.
 */
async function getUsdtBook(fiat, exchanges) {
  const wanted = (exchanges || []).filter((id) => ALL_PLATFORM_IDS.includes(id));
  const ids = wanted.length ? wanted : ALL_PLATFORM_IDS;

  const results = await Promise.allSettled(ids.map((id) => getPlatformBook(id, fiat)));

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

function computeCycle({ startFiat, midFiat, balance, startBuyAds, midSellAds, midBuyAds, startSellAds, startMethod, midMethod, picks = {} }) {
  const base = { startFiat, midFiat, balance };

  // Each ad is picked in order, size-aware against the amount THAT specific
  // hop actually carries - buyA against the starting balance, sellA against
  // however much USDT buyA's own price and capacity yielded, and so on. That
  // amount only exists once the previous hop is resolved, so the two legs of
  // each conversion can no longer be picked independently/concurrently. A
  // manual pick in `picks` (from a user overriding the automatic choice in
  // the UI) wins over the automatic pick whenever that exact ad still exists.
  const buyARanked = rankAds(startBuyAds, 'buy', startMethod);
  const buyA = pickAd(buyARanked, (ad) => fitsBuy(ad, balance), picks.buyA);
  if (!buyA) {
    return { ...base, error: `Sem anúncios para comprar em ${startFiat}${fmtMethod(startMethod)} agora.` };
  }
  const qtyA = Math.min(balance / buyA.price, buyA.tradableQuantity || Infinity);

  const sellARanked = rankAds(midSellAds, 'sell', midMethod);
  const sellA = pickAd(sellARanked, (ad) => fitsSell(ad, qtyA), picks.sellA);
  if (!sellA) {
    return { ...base, error: `Sem anúncios para vender em ${midFiat}${fmtMethod(midMethod)} agora.` };
  }
  const midAmount = qtyA * sellA.price; // now holding this much in midFiat
  const legA = {
    buy: legInfo(buyA, balance, buyARanked, matchesPin(buyA, picks.buyA)),
    sell: legInfo(sellA, midAmount, sellARanked, matchesPin(sellA, picks.sellA)),
    qty: qtyA,
    proceeds: midAmount,
  };

  const buyBRanked = rankAds(midBuyAds, 'buy', midMethod);
  const buyB = pickAd(buyBRanked, (ad) => fitsBuy(ad, midAmount), picks.buyB);
  if (!buyB) {
    return { ...base, legA, error: `Sem anúncios para comprar em ${midFiat}${fmtMethod(midMethod)}, para fechar o ciclo.` };
  }
  const qtyB = Math.min(midAmount / buyB.price, buyB.tradableQuantity || Infinity);

  const sellBRanked = rankAds(startSellAds, 'sell', startMethod);
  const sellB = pickAd(sellBRanked, (ad) => fitsSell(ad, qtyB), picks.sellB);
  if (!sellB) {
    return { ...base, legA, error: `Sem anúncios para vender em ${startFiat}${fmtMethod(startMethod)}, para fechar o ciclo.` };
  }
  const finalAmount = qtyB * sellB.price; // back in startFiat

  const legB = {
    buy: legInfo(buyB, midAmount, buyBRanked, matchesPin(buyB, picks.buyB)),
    sell: legInfo(sellB, finalAmount, sellBRanked, matchesPin(sellB, picks.sellB)),
    qty: qtyB,
    proceeds: finalAmount,
  };

  const profit = finalAmount - balance;
  const profitPct = balance > 0 ? (profit / balance) * 100 : null;

  return { ...base, legA, legB, finalAmount, profit, profitPct };
}

const DEFAULT_FIATS = ['MZN', 'ZAR', 'USD', 'EUR', 'GBP', 'KES', 'NGN', 'BRL'];

app.get('/api/defaults', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ fiats: DEFAULT_FIATS, exchanges: ALL_PLATFORM_IDS.map((id) => ({ id, name: PLATFORM_NAMES[id] })) });
});

/** Comma-separated list of platform ids from a query param, dropping anything unrecognized - never lets a typo silently restrict to zero exchanges. */
function parseExchanges(req) {
  const raw = req.query.exchanges;
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((id) => ALL_PLATFORM_IDS.includes(id));
}

// Real payment methods seen right now in this fiat's live ads - never a
// fixed/guessed list, so the dropdown can never offer a wallet/method that
// doesn't actually exist there (e.g. Dukascopy only shows up for EUR).
app.get('/api/methods', async (req, res) => {
  try {
    const fiat = String(req.query.fiat || '').toUpperCase();
    if (!fiat) return res.status(400).json({ error: 'Indica uma moeda.' });

    const book = await getUsdtBook(fiat, parseExchanges(req));
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

    const exchanges = parseExchanges(req);
    const [bookA, bookB] = await Promise.all([getUsdtBook(fiatA, exchanges), getUsdtBook(fiatB, exchanges)]);
    const startBook = start === fiatA ? bookA : bookB;
    const midBook = start === fiatA ? bookB : bookA;

    // A manual override from the ad picker in the UI - "platform:advNo" - for
    // one specific hop of the cycle. Anything malformed or missing is just no
    // pin at all, falling straight back to the automatic pick.
    const parsePick = (raw) => {
      if (!raw) return null;
      const sep = String(raw).indexOf(':');
      if (sep < 0) return null;
      const platform = raw.slice(0, sep);
      const advNo = raw.slice(sep + 1);
      return platform && advNo ? { platform, advNo } : null;
    };
    const picks = {
      buyA: parsePick(req.query.pickLegABuy),
      sellA: parsePick(req.query.pickLegASell),
      buyB: parsePick(req.query.pickLegBBuy),
      sellB: parsePick(req.query.pickLegBSell),
    };

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
      picks,
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
