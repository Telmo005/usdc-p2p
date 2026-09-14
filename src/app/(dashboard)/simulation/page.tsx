import { ShoppingCart, TrendingUp, SlidersHorizontal, History } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMarketSeries } from '@/lib/db';
import { getOpenLots, getPositionSummaries, getRecentSales } from '@/lib/simulation';
import { getRealWalletSnapshot } from '@/lib/wallet';
import { getMidRates } from '@/lib/exchangeRates';
import { fromProfile, resolveReferenceAmount } from '@/lib/capitalSettings';
import { TRACKED_PAIRS } from '@/lib/marketAnalysis';
import { fetchPairBooks } from '@/lib/multiAdOpportunity';
import { QuickSimulator } from '@/components/QuickSimulator';
import { CurrencyCycle } from '@/components/CurrencyCycle';
import { ProfitCalculator } from '@/components/ProfitCalculator';
import { WalletSaleSimulator, type SellableBalance, type MarketPairWithAge } from '@/components/WalletSaleSimulator';
import { MultiAdSimulator, type PairBooks } from '@/components/MultiAdSimulator';
import { PositionsTable, type LotRow } from '@/components/PositionsTable';
import { AddLotForm, RecordSaleForm } from '@/components/SimulationForms';
import { StatCard } from '@/components/StatCard';
import { DataTag } from '@/components/DataTag';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
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
  // Two distinct "arrived here from elsewhere" flows, distinguished by which
  // params show up: `wallet` means "sell what I already hold" (Carteira,
  // Phase 2); `price` without `wallet` means "plan around this specific
  // ad's price" (Anúncios, Phase 4) - they never collide.
  const fromAd = !sp.wallet && sp.price != null && (sp.side === 'buy' || sp.side === 'sell');

  const [marketSeries, lots, positions, sales] = await Promise.all([
    getMarketSeries(),
    getOpenLots(user.id),
    getPositionSummaries(user.id),
    getRecentSales(user.id, 20),
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
  // would be meaningless (they're different currencies).
  const unrealizedByFiat = new Map<string, number>();
  for (const p of positions) {
    const sell = marketPrices[`${p.asset}/${p.fiat}`]?.sell;
    if (sell == null) continue;
    unrealizedByFiat.set(p.fiat, (unrealizedByFiat.get(p.fiat) ?? 0) + (p.quantityOpen * sell - p.totalCostBasis));
  }
  const realizedByFiat = new Map<string, number>();
  for (const s of sales) realizedByFiat.set(s.fiat, (realizedByFiat.get(s.fiat) ?? 0) + Number(s.realized_profit));
  const fiats = [...new Set([...unrealizedByFiat.keys(), ...realizedByFiat.keys()])];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Simulação</h1>
        <p className="mt-1 text-sm text-muted">
          Regista as tuas compras, descobre o preço ideal de venda para o lucro que queres, e acompanha o lucro (real e por
          realizar) da tua posição a preços de mercado reais.
        </p>
      </div>

      {walletFetchError && (
        <ErrorBanner
          title="Não consegui ler o saldo real da Binance"
          message={`${walletFetchError} A simulação com saldo real fica indisponível até conseguires atualizar - as restantes ferramentas abaixo continuam a funcionar normalmente.`}
        />
      )}

      {sellableBalances.length > 0 ? (
        <WalletSaleSimulator
          balances={sellableBalances}
          marketPairs={marketPairsWithAge}
          mznRate={mznRate}
          zarRate={zarRate}
          walletFetchedAt={walletSnapshot!.fetchedAt}
          initialAsset={sp.asset}
          initialWallet={sp.wallet}
          initialFiat={sp.fiat}
          initialQuantity={sp.qty ? Number(sp.qty) : undefined}
        />
      ) : (
        !walletFetchError && (
          <EmptyState
            title="Sem saldo real disponível para simular venda"
            description="Assim que tiveres saldo num ativo com mercado rastreado (ex.: USDT) em Spot ou Funding, aparece aqui uma simulação de venda pronta a usar - ou chega cá diretamente a partir da Carteira."
          />
        )
      )}

      <MultiAdSimulator
        pairs={pairBooks}
        capitalSettings={capitalSettings}
        initialAmount={multiAdAmount ?? referenceAmount}
        initialPairIndex={multiAdPairIndex >= 0 ? multiAdPairIndex : undefined}
      />

      <QuickSimulator pairs={marketPairs} initialAmount={referenceAmount} />

      <CurrencyCycle pairs={marketPairs} initialAmount={referenceAmount} />

      <details className="group rounded-xl border border-border bg-surface open:pb-5" open={fromAd}>
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-muted marker:hidden group-open:text-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="transition group-open:rotate-90">▶</span> Calculadora avançada (planear um preço-alvo, teto de compra,
            quantidade)
          </span>
        </summary>
        <div className="px-5">
          <ProfitCalculator
            marketPairs={marketPairs}
            initialAsset={fromAd ? sp.asset : undefined}
            initialFiat={fromAd ? sp.fiat : undefined}
            initialSide={fromAd ? (sp.side as 'buy' | 'sell') : undefined}
            initialPrice={fromAd ? Number(sp.price) : undefined}
          />
        </div>
      </details>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Quantidade em aberto"
          value={positions.length === 0 ? '—' : positions.map((p) => `${p.quantityOpen} ${p.asset}`).join(', ')}
        />
        {fiats.length <= 1 ? (
          <StatCard
            label="Lucro não realizado + realizado"
            value={
              fiats.length === 0
                ? '—'
                : `${((unrealizedByFiat.get(fiats[0]) ?? 0) + (realizedByFiat.get(fiats[0]) ?? 0)).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiats[0]}`
            }
            tone={fiats.length === 0 ? undefined : (unrealizedByFiat.get(fiats[0]) ?? 0) + (realizedByFiat.get(fiats[0]) ?? 0) >= 0 ? 'positive' : 'negative'}
            sub={fiats.length === 1 ? `não realizado ${(unrealizedByFiat.get(fiats[0]) ?? 0).toFixed(2)} · realizado ${(realizedByFiat.get(fiats[0]) ?? 0).toFixed(2)}` : undefined}
          />
        ) : (
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">Lucro por moeda</div>
            <div className="mt-2 flex flex-col gap-1.5">
              {fiats.map((fiat) => {
                const total = (unrealizedByFiat.get(fiat) ?? 0) + (realizedByFiat.get(fiat) ?? 0);
                return (
                  <div key={fiat} className="flex items-center justify-between text-sm">
                    <span className="text-muted">{fiat}</span>
                    <span className={`font-mono font-semibold ${total >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {total.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {fiat}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <SectionCard
        title="Registar compra"
        icon={ShoppingCart}
        subtitle="Separado do histórico sincronizado da Binance - regista aqui qualquer compra (Binance, outra plataforma, dinheiro) que queiras incluir na simulação."
        action={<DataTag source="manual" />}
      >
        <AddLotForm />
      </SectionCard>

      <SectionCard title="Posições" icon={TrendingUp} action={<DataTag source="manual" />}>
        <PositionsTable lots={lotRows} marketPrices={marketPrices} />
      </SectionCard>

      <SectionCard
        title="Registar venda"
        icon={SlidersHorizontal}
        subtitle="A quantidade vendida é consumida das compras mais antigas primeiro (FIFO). Se a quantidade ultrapassar um lote, o resto sai do lote seguinte automaticamente."
        action={<DataTag source="manual" />}
      >
        <RecordSaleForm />
      </SectionCard>

      <SectionCard title="Histórico de vendas" icon={History} action={<DataTag source="manual" />}>
        {sales.length === 0 ? (
          <EmptyState title="Ainda sem vendas registadas" description="Aparecem aqui assim que registares uma venda acima." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4">Par</th>
                    <th className="pb-2 pr-4">Quantidade</th>
                    <th className="pb-2 pr-4">Preço de venda</th>
                    <th className="pb-2 pr-4">Lucro realizado</th>
                    <th className="pb-2">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="py-2 pr-4">
                        {s.asset}/{s.fiat}
                      </td>
                      <td className="py-2 pr-4 font-mono">{s.quantity}</td>
                      <td className="py-2 pr-4 font-mono">{s.sell_price}</td>
                      <td className={`py-2 pr-4 font-mono ${Number(s.realized_profit) >= 0 ? 'text-positive' : 'text-negative'}`}>
                        {Number(s.realized_profit).toFixed(2)} {s.fiat}
                      </td>
                      <td className="py-2 text-muted">{new Date(s.created_at).toLocaleString('pt-PT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2 md:hidden">
              {sales.map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {s.asset}/{s.fiat} · {s.quantity} a {s.sell_price}
                    </span>
                    <span className={`font-mono ${Number(s.realized_profit) >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {Number(s.realized_profit).toFixed(2)} {s.fiat}
                    </span>
                  </div>
                  <div className="mt-1 text-muted">{new Date(s.created_at).toLocaleString('pt-PT')}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
