const express = require('express');
const path = require('path');
const compression = require('compression');
const binance = require('./lib/binanceClient');
const cache = require('./lib/cache');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));

// Ads from advertisers with a poor track record are excluded - no point
// recommending a trade that's likely to stall or get cancelled.
function isReputable(ad) {
  const fr = ad.advertiser?.monthFinishRate;
  const pr = ad.advertiser?.positiveRate;
  return (fr == null || fr >= 0.8) && (pr == null || pr >= 0.9);
}

/** Best reputable ad for a side: cheapest if buying, priciest if selling. `method`, if given, restricts to ads that actually offer it - e.g. "só quero vender via Dukascopy". */
function bestAd(ads, side, method) {
  const candidates = method ? ads.filter((ad) => ad.payTypes.some((pt) => pt.name === method)) : ads;
  const reputable = candidates.filter(isReputable);
  if (!reputable.length) return null;
  const sorted = side === 'buy' ? reputable.sort((a, b) => a.price - b.price) : reputable.sort((a, b) => b.price - a.price);
  return sorted[0];
}

function legInfo(ad, amountInThisLeg) {
  return {
    price: ad.price,
    advertiser: ad.advertiser.nickName,
    method: ad.payTypes[0]?.name ?? null,
    minAmount: ad.minAmount,
    maxAmount: ad.maxAmount,
    fits: amountInThisLeg >= ad.minAmount && amountInThisLeg <= ad.maxAmount,
  };
}

const BOOK_CACHE_TTL_MS = 10_000;

/** Binance USDT book for one fiat, cached + single-flight so a 20s auto-refresh never duplicates a request. */
function getUsdtBook(fiat) {
  return cache.getOrFetch(`book:binance:USDT:${fiat}`, () => binance.fetchBook({ asset: 'USDT', fiat, rows: 20 }), BOOK_CACHE_TTL_MS);
}

/**
 * A full round trip: start with `balance` in `startFiat`, buy USDT, sell that
 * USDT for `midFiat`, then immediately buy USDT again with THOSE exact
 * proceeds, and sell that back for `startFiat`. The final amount is directly
 * comparable to the balance you started with - same currency, no reference
 * exchange rate needed, no approximation. Two ordered legs, one real number.
 */
function computeCycle({ startFiat, midFiat, balance, startBuyAds, midSellAds, midBuyAds, startSellAds, startMethod, midMethod }) {
  const base = { startFiat, midFiat, balance };

  const buyA = bestAd(startBuyAds, 'buy', startMethod);
  const sellA = bestAd(midSellAds, 'sell', midMethod);
  if (!buyA || !sellA) {
    const missing = !buyA ? `comprar em ${startFiat}${startMethod ? ` via ${startMethod}` : ''}` : `vender em ${midFiat}${midMethod ? ` via ${midMethod}` : ''}`;
    return { ...base, error: `Sem anúncios para ${missing} agora.` };
  }

  const qtyA = Math.min(balance / buyA.price, buyA.tradableQuantity || Infinity);
  const midAmount = qtyA * sellA.price; // now holding this much in midFiat

  const buyB = bestAd(midBuyAds, 'buy', midMethod);
  const sellB = bestAd(startSellAds, 'sell', startMethod);
  const legA = { buy: legInfo(buyA, balance), sell: legInfo(sellA, midAmount), qty: qtyA, proceeds: midAmount };

  if (!buyB || !sellB) {
    const missing = !buyB ? `comprar em ${midFiat}${midMethod ? ` via ${midMethod}` : ''}` : `vender em ${startFiat}${startMethod ? ` via ${startMethod}` : ''}`;
    return { ...base, legA, error: `Sem anúncios para ${missing}, para fechar o ciclo.` };
  }

  const qtyB = Math.min(midAmount / buyB.price, buyB.tradableQuantity || Infinity);
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
    [...book.buy, ...book.sell].forEach((ad) => ad.payTypes.forEach((pt) => names.add(pt.name)));

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
    // whichever of start/mid that fiat actually is this time.
    const methodA = req.query.methodA || null;
    const methodB = req.query.methodB || null;
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

app.listen(PORT, () => {
  console.log(`Ciclo P2P via USDT a correr em http://localhost:${PORT}`);
});
