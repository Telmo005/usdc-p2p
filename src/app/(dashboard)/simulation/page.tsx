import { Calculator } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMarketSeries } from '@/lib/db';
import { getOpenLots, getPositionSummaries, getRecentSales } from '@/lib/simulation';
import { getRealWalletSnapshot } from '@/lib/wallet';
import { getMidRates } from '@/lib/exchangeRates';
import { fromProfile, resolveReferenceAmount } from '@/lib/capitalSettings';
import { TRACKED_PAIRS } from '@/lib/marketAnalysis';
import { fetchPairBooks } from '@/lib/multiAdOpportunity';
import type { PairBooks } from '@/lib/multiAdOpportunity';
import { getWatchedAdvertiserNicknames } from '@/lib/watchlist';
import { type SellableBalance, type MarketPairWithAge } from '@/components/WalletSaleSimulator';
import { SimulationTabs } from '@/components/SimulationTabs';
import { RefreshButton } from '@/components/RefreshButton';
import type { LotRow } from '@/components/PositionsTable';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

export default async function SimulationPage({
  searchParams,
}: {
  searchParams: Promise<{
    asset?: string;
    fiat?: string;
    wallet?: string;
    qty?: string;
    side?: string;
    price?: string;
    pair?: string;
    amount?: string;
  }>;
}) {
  const { user, profile } = await requireUser();
  const capitalSettings = fromProfile(profile);
  const sp = await searchParams;
  // Three distinct "arrived here from elsewhere" flows, distinguished by
  // which params show up - never collide, and each now also decides which
  // tab (Phase 19 restructuring) the page lands on:
  // `wallet` means "sell what I already hold" (Carteira); `price` without
  // `wallet` means "plan around this specific ad's price" (Anúncios); `pair`/
  // `amount` means "simulate the value Oportunidades found" (Opportunity
  // Center).
  const fromAd = !sp.wallet && sp.price != null && (sp.side === 'buy' || sp.side === 'sell');
  const fromWallet = sp.wallet != null;
  const fromOpportunity = sp.pair != null || sp.amount != null;

  const [marketSeries, lots, positions, sales, watchedAdvertisers] = await Promise.all([
    getMarketSeries(),
    getOpenLots(user.id),
    getPositionSummaries(user.id),
    getRecentSales(user.id, 20),
    getWatchedAdvertiserNicknames(user.id),
  ]);

  const marketPairs = marketSeries.map((s) => ({ asset: s.asset, fiat: s.fiat, buyPrice: s.lastBuy, sellPrice: s.lastSell }));
  const marketPrices: Record<string, { buy: number | null; sell: number | null }> = {};
  for (const s of marketSeries) marketPrices[`${s.asset}/${s.fiat}`] = { buy: s.lastBuy, sell: s.lastSell };

  const marketPairsWithAge: MarketPairWithAge[] = marketSeries.map((s) => ({
    asset: s.asset,
    fiat: s.fiat,
    buyPrice: s.lastBuy,
    sellPrice: s.lastSell,
    fetchedAt: s.ticks.length > 0 ? s.ticks[s.ticks.length - 1].t : null,
  }));

  const { mznRate, zarRate } = getMidRates(marketSeries);
  let walletSnapshot: Awaited<ReturnType<typeof getRealWalletSnapshot>> | null = null;
  let walletFetchError: string | null = null;
  try {
    walletSnapshot = await getRealWalletSnapshot(mznRate, zarRate);
  } catch (err) {
    walletFetchError = err instanceof Error ? err.message : 'Falha ao ler o saldo da Binance.';
  }

  const { amount: referenceAmount } = resolveReferenceAmount(capitalSettings, walletSnapshot?.totalMzn ?? null);

  // Real individual ads (not the aggregate avg_top_price) for the
  // multi-advertiser fill simulator - same fetch ads/page.tsx already does,
  // just also kept for the buy side here.
  const allPairBooks = await Promise.all(TRACKED_PAIRS.map((pair) => fetchPairBooks(pair.asset, pair.fiat)));
  const pairBooks: PairBooks[] = allPairBooks.filter((p) => p.buyAds.length > 0 || p.sellAds.length > 0);

  // Deep-link from an Opportunities search result ("Simular este valor") -
  // distinct param names from the wallet/ad-price flows above so they can
  // never collide.
  const multiAdPairIndex = sp.pair ? pairBooks.findIndex((p) => `${p.asset}-${p.fiat}` === sp.pair) : -1;
  const multiAdAmount = sp.amount ? Number(sp.amount) : undefined;

  const defaultTab = fromOpportunity ? 'multi' : fromAd || fromWallet ? 'quick' : 'overview';

  const sellableBalances: SellableBalance[] = walletSnapshot
    ? walletSnapshot.groups.flatMap((g) =>
        g.balances
          .filter((b) => b.quantity > 0 && TRACKED_PAIRS.some((p) => p.asset === b.asset))
          .map((b) => ({ asset: b.asset, wallet: g.id, quantity: b.quantity }))
      )
    : [];

  const lotRows: LotRow[] = lots.map((l) => ({
    id: l.id,
    asset: l.asset,
    fiat: l.fiat,
    quantity: Number(l.quantity),
    quantityRemaining: Number(l.quantity_remaining),
    buyPrice: Number(l.buy_price),
    buyFee: Number(l.buy_fee),
    notes: l.notes,
    createdAt: l.created_at,
  }));

  // Kept per-fiat throughout - summing MZN and ZAR profit into one number
  // would be meaningless (they're different currencies). Reduced to a plain
  // array (not a Map) since this crosses into a Client Component as a prop.
  const unrealizedByFiat = new Map<string, number>();
  for (const p of positions) {
    const sell = marketPrices[`${p.asset}/${p.fiat}`]?.sell;
    if (sell == null) continue;
    unrealizedByFiat.set(p.fiat, (unrealizedByFiat.get(p.fiat) ?? 0) + (p.quantityOpen * sell - p.totalCostBasis));
  }
  const realizedByFiat = new Map<string, number>();
  for (const s of sales) realizedByFiat.set(s.fiat, (realizedByFiat.get(s.fiat) ?? 0) + Number(s.realized_profit));
  const fiats = [...new Set([...unrealizedByFiat.keys(), ...realizedByFiat.keys()])];
  const profitByFiat = fiats.map((fiat) => {
    const unrealized = unrealizedByFiat.get(fiat) ?? 0;
    const realized = realizedByFiat.get(fiat) ?? 0;
    return { fiat, unrealized, realized, total: unrealized + realized };
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Calculator size={18} />
          </span>
          <div>
            <h1 className="text-xl font-bold">Simulação</h1>
            <p className="mt-1 text-sm text-muted">
              Regista as tuas compras, descobre o preço ideal de venda para o lucro que queres, e acompanha o lucro (real e por
              realizar) da tua posição a preços de mercado reais.
            </p>
          </div>
        </div>
        <RefreshButton label="Atualizar página" />
      </div>

      {walletFetchError && (
        <ErrorBanner
          title="Não consegui ler o saldo real da Binance"
          message={`${walletFetchError} A simulação com saldo real fica indisponível até conseguires atualizar - as restantes ferramentas continuam a funcionar normalmente.`}
        />
      )}

      <SimulationTabs
        defaultTab={defaultTab}
        capitalSettings={capitalSettings}
        referenceAmount={referenceAmount}
        marketPairs={marketPairs}
        marketPrices={marketPrices}
        sellableBalances={sellableBalances}
        marketPairsWithAge={marketPairsWithAge}
        mznRate={mznRate}
        zarRate={zarRate}
        walletFetchedAt={walletSnapshot?.fetchedAt ?? null}
        walletFetchError={walletFetchError}
        initialAsset={sp.asset}
        initialWallet={sp.wallet}
        initialFiat={sp.fiat}
        initialQuantity={sp.qty ? Number(sp.qty) : undefined}
        pairBooks={pairBooks}
        multiAdAmount={multiAdAmount}
        multiAdPairIndex={multiAdPairIndex >= 0 ? multiAdPairIndex : undefined}
        watchedAdvertisers={watchedAdvertisers}
        fromAdAsset={fromAd ? sp.asset : undefined}
        fromAdFiat={fromAd ? sp.fiat : undefined}
        fromAdSide={fromAd ? (sp.side as 'buy' | 'sell') : undefined}
        fromAdPrice={fromAd ? Number(sp.price) : undefined}
        positionRows={positions}
        lotRows={lotRows}
        sales={sales}
        profitByFiat={profitByFiat}
      />
    </div>
  );
}
