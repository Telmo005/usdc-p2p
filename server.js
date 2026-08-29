const express = require('express');
const path = require('path');
const compression = require('compression');
const platforms = require('./lib/platforms');
const cache = require('./lib/cache');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));

// Ads from advertisers with a poor track record are excluded from results -
// no point recommending a trade that's likely to stall or get cancelled.
function isReputable(ad) {
  const fr = ad.advertiser?.monthFinishRate;
  const pr = ad.advertiser?.positiveRate;
  const okFinish = fr == null || fr >= 0.8;
  const okPositive = pr == null || pr >= 0.9;
  return okFinish && okPositive;
}

// Unfiltered "what's the best price" view only needs the top of the book -
// deeper ads are worse-priced by definition, so nothing is hidden there.
// But once a payment method filter is active, the top 20 unfiltered ads can
// easily miss a method that's real and active but not among the cheapest/
// priciest right now - so filtered lookups (and method discovery, which by
// definition must not miss anything) go much deeper into the book.
const FAST_ROWS = 20;
const DEEP_ROWS = 60;

// Short TTL: just under the frontend's 15s auto-refresh, so the periodic
// poll still gets fresh prices every cycle, while bursts (page load firing
// two requests at once, several browser tabs, a rapid filter change) collapse
// into a single upstream fetch instead of duplicating it.
const BOOK_CACHE_TTL_MS = 12_000;

async function getBook(platformId, asset, fiat, { deep = false, priority = 'high' } = {}) {
  const rows = deep ? DEEP_ROWS : FAST_ROWS;
  const key = `book:${platformId}:${asset}:${fiat}:${rows}`;
  return cache.getOrFetch(
    key,
    () => {
      const platform = platforms.getPlatform(platformId);
      if (!platform) throw new Error(`Plataforma desconhecida: ${platformId}`);
      return platform.fetchBook({ asset, fiat, rows, priority });
    },
    BOOK_CACHE_TTL_MS,
    // A 'high' priority caller (the book the user is looking at right now)
    // must never end up silently waiting behind an in-flight 'low' priority
    // fetch (the background method-catalog scan) that hasn't started running
    // yet - see rateGate.js. 'low' callers are happy to join anything.
    { tag: priority, minTag: priority === 'high' ? 'high' : undefined }
  );
}

app.get('/api/platforms', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(platforms.listPlatforms());
});

const CATALOG_FIATS = ['MZN', 'USD', 'EUR', 'ZAR', 'GBP', 'BRL', 'NGN', 'KES', 'ARS'];

app.get('/api/defaults', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    assets: ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB'],
    fiats: CATALOG_FIATS,
  });
});

// Payment methods don't change minute to minute, so the (slow, 9-fiat) scan
// behind each entry is cached per platform+asset+fiat for several minutes -
// the first person to view a platform+asset pays the ~25-30s cold scan once;
// everyone else (or the same person switching back and forth) gets it from
// memory, instantly, until it naturally goes stale.
const CATALOG_CACHE_TTL_MS = 3 * 60 * 1000;

// The full payment-method catalog for a platform, not just the currently
// selected fiat - a method can be very real and still be invisible if you
// only ever look at one market. Scans every candidate fiat and tells you
// exactly which fiat(s) each method actually has live ads in right now, so
// "I don't see my payment method" always has a concrete, honest answer:
// either it's not in this fiat (and here's which one it IS in), or it truly
// isn't active on this platform anywhere right now.
app.get('/api/methods', async (req, res) => {
  try {
    const { platform = 'binance', asset = 'USDT' } = req.query;
    const assetU = String(asset).toUpperCase();

    // Low priority: this background scan must never delay the order book the
    // user is actively looking at (see rateGate.js). Cached per fiat for
    // minutes at a time - see CATALOG_CACHE_TTL_MS above.
    const perFiat = await Promise.all(
      CATALOG_FIATS.map(async (fiat) => {
        try {
          const book = await cache.getOrFetch(
            `catalog:${platform}:${assetU}:${fiat}`,
            () => getBook(platform, assetU, fiat, { deep: false, priority: 'low' }),
            CATALOG_CACHE_TTL_MS
          );
          return { fiat, ads: [...book.buy, ...book.sell] };
        } catch {
          return { fiat, ads: [] };
        }
      })
    );

    const byName = new Map(); // name -> Map(fiat -> count)
    for (const { fiat, ads } of perFiat) {
      for (const ad of ads) {
        for (const pt of ad.payTypes) {
          if (!byName.has(pt.name)) byName.set(pt.name, new Map());
          const fiats = byName.get(pt.name);
          fiats.set(fiat, (fiats.get(fiat) || 0) + 1);
        }
      }
    }

    const methods = [...byName.entries()]
      .map(([name, fiats]) => ({
        name,
        fiats: [...fiats.entries()]
          .map(([fiat, count]) => ({ fiat, count }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt'));

    res.json({ platform, asset: assetU, fiatsScanned: CATALOG_FIATS, methods });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/book', async (req, res) => {
  try {
    const { platform = 'binance', asset = 'USDT', fiat = 'MZN', methods = '' } = req.query;
    const selected = String(methods).split(',').map((m) => m.trim()).filter(Boolean);
    const assetU = String(asset).toUpperCase();
    const fiatU = String(fiat).toUpperCase();

    const book = await getBook(platform, assetU, fiatU, { deep: selected.length > 0 });

    // Track exactly how many ads got excluded and why, so "missing" opportunities
    // are always explainable instead of silently vanishing.
    let excludedByMethod = 0;
    let excludedByReputation = 0;

    const filterSide = (ads) =>
      ads
        .filter((ad) => {
          const matchesMethod = !selected.length || ad.payTypes.some((pt) => selected.includes(pt.name));
          if (!matchesMethod) excludedByMethod += 1;
          return matchesMethod;
        })
        .filter((ad) => {
          const reputable = isReputable(ad);
          if (!reputable) excludedByReputation += 1;
          return reputable;
        })
        .map((ad) => ({
          price: ad.price,
          methods: ad.payTypes.map((pt) => pt.name),
          advertiser: ad.advertiser.nickName,
          minAmount: ad.minAmount,
          maxAmount: ad.maxAmount,
          tradableQuantity: ad.tradableQuantity,
          finishRate: ad.advertiser.monthFinishRate,
          positiveRate: ad.advertiser.positiveRate,
          orderCount: ad.advertiser.monthOrderCount,
          payTimeLimit: ad.payTimeLimit,
        }));

    // "buy" = ads where you buy (their sell offers), cheapest first.
    // "sell" = ads where you sell (their buy offers), priciest first.
    const buyFiltered = filterSide(book.buy);
    const sellFiltered = filterSide(book.sell);
    const buy = buyFiltered.sort((a, b) => a.price - b.price).slice(0, 15);
    const sell = sellFiltered.sort((a, b) => b.price - a.price).slice(0, 15);

    const bestBuy = buy[0] || null;
    const bestSell = sell[0] || null;
    const spreadPct = bestBuy && bestSell ? ((bestSell.price - bestBuy.price) / bestBuy.price) * 100 : null;

    res.json({
      platform,
      asset: assetU,
      fiat: fiatU,
      methods: selected,
      searchDepth: selected.length ? DEEP_ROWS : FAST_ROWS,
      generatedAt: new Date().toISOString(),
      best: { buy: bestBuy, sell: bestSell, spreadPct },
      transparency: {
        scanned: book.buy.length + book.sell.length,
        excludedByMethod,
        excludedByReputation,
        matchingNotShown: Math.max(0, buyFiltered.length + sellFiltered.length - buy.length - sell.length),
      },
      buy,
      sell,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Quick side-by-side glance at every platform's current best price for the
// same asset+fiat - unfiltered (top-of-book only), so it stays fast even
// though it hits all 3 platforms at once. Not a replacement for the main
// filtered view, just a "is it worth switching platform?" signal.
app.get('/api/compare', async (req, res) => {
  const { asset = 'USDT', fiat = 'MZN' } = req.query;
  const assetU = String(asset).toUpperCase();
  const fiatU = String(fiat).toUpperCase();

  const results = await Promise.all(
    platforms.listPlatforms().map(async ({ id, label }) => {
      try {
        const book = await getBook(id, assetU, fiatU, { deep: false });
        const reputableBuy = book.buy.filter(isReputable).sort((a, b) => a.price - b.price);
        const reputableSell = book.sell.filter(isReputable).sort((a, b) => b.price - a.price);
        const bestBuy = reputableBuy[0]?.price ?? null;
        const bestSell = reputableSell[0]?.price ?? null;
        const spreadPct = bestBuy && bestSell ? ((bestSell - bestBuy) / bestBuy) * 100 : null;
        return { platform: id, label, bestBuy, bestSell, spreadPct };
      } catch (err) {
        return { platform: id, label, error: err.message };
      }
    })
  );

  res.json({ asset: assetU, fiat: fiatU, platforms: results });
});

app.listen(PORT, () => {
  console.log(`P2P dashboard a correr em http://localhost:${PORT}`);
});
