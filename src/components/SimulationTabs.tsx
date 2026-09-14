'use client';

import { useState } from 'react';
import { ShoppingCart, TrendingUp, SlidersHorizontal, History } from 'lucide-react';
import { Tabs } from '@/components/ui/Tabs';
import { QuickSimulator } from '@/components/QuickSimulator';
import { CurrencyCycle } from '@/components/CurrencyCycle';
import { ProfitCalculator } from '@/components/ProfitCalculator';
import { WalletSaleSimulator, type SellableBalance, type MarketPairWithAge } from '@/components/WalletSaleSimulator';
import { MultiAdSimulator } from '@/components/MultiAdSimulator';
import type { PairBooks } from '@/lib/multiAdOpportunity';
import { PositionsTable, type LotRow } from '@/components/PositionsTable';
import { AddLotForm, RecordSaleForm } from '@/components/SimulationForms';
import { StatCard } from '@/components/StatCard';
import { DataTag } from '@/components/DataTag';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CapitalSettings } from '@/lib/capitalSettings';
import type { SimSale } from '@/lib/simulation';

type MarketPair = { asset: string; fiat: string; buyPrice: number | null; sellPrice: number | null };
type ProfitRow = { fiat: string; unrealized: number; realized: number; total: number };

const TABS = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'quick', label: 'Simulador Rápido' },
  { id: 'multi', label: 'Comparador de Anúncios' },
  { id: 'cycle', label: 'Câmbio MZN⇄ZAR' },
  { id: 'records', label: 'Meus Registos' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * Simulação used to stack every tool (multi-ad, quick sim, câmbio,
 * calculadora, posições, registos) in one endless scroll - the single
 * worst structural UX problem found in the redesign audit. Splits it into
 * tabs instead: one job per tab, "Visão Geral" as an at-a-glance landing
 * spot. All the actual data fetching stays in the server page
 * (simulation/page.tsx) - this only owns which tab is active and where
 * each already-fetched prop gets rendered.
 */
export function SimulationTabs({
  defaultTab,
  capitalSettings,
  referenceAmount,
  marketPairs,
  marketPrices,
  sellableBalances,
  marketPairsWithAge,
  mznRate,
  zarRate,
  walletFetchedAt,
  walletFetchError,
  initialAsset,
  initialWallet,
  initialFiat,
  initialQuantity,
  pairBooks,
  multiAdAmount,
  multiAdPairIndex,
  watchedAdvertisers,
  fromAdAsset,
  fromAdFiat,
  fromAdSide,
  fromAdPrice,
  positionRows,
  lotRows,
  sales,
  profitByFiat,
}: {
  defaultTab: TabId;
  capitalSettings: CapitalSettings;
  referenceAmount: number;
  marketPairs: MarketPair[];
  marketPrices: Record<string, { buy: number | null; sell: number | null }>;
  sellableBalances: SellableBalance[];
  marketPairsWithAge: MarketPairWithAge[];
  mznRate: number | null;
  zarRate: number | null;
  walletFetchedAt: number | null;
  walletFetchError: string | null;
  initialAsset?: string;
  initialWallet?: string;
  initialFiat?: string;
  initialQuantity?: number;
  pairBooks: PairBooks[];
  multiAdAmount?: number;
  multiAdPairIndex?: number;
  watchedAdvertisers: string[];
  fromAdAsset?: string;
  fromAdFiat?: string;
  fromAdSide?: 'buy' | 'sell';
  fromAdPrice?: number;
  positionRows: Array<{ asset: string; quantityOpen: number }>;
  lotRows: LotRow[];
  sales: SimSale[];
  profitByFiat: ProfitRow[];
}) {
  const [tab, setTab] = useState<TabId>(defaultTab);

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={TABS as unknown as Array<{ id: string; label: string }>} active={tab} onChange={(id) => setTab(id as TabId)} />

      {tab === 'overview' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              label="Quantidade em aberto"
              value={positionRows.length === 0 ? '—' : positionRows.map((p) => `${p.quantityOpen} ${p.asset}`).join(', ')}
            />
            {profitByFiat.length <= 1 ? (
              <StatCard
                label="Lucro não realizado + realizado"
                value={
                  profitByFiat.length === 0
                    ? '—'
                    : `${profitByFiat[0].total.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${profitByFiat[0].fiat}`
                }
                tone={profitByFiat.length === 0 ? undefined : profitByFiat[0].total >= 0 ? 'positive' : 'negative'}
                sub={
                  profitByFiat.length === 1
                    ? `não realizado ${profitByFiat[0].unrealized.toFixed(2)} · realizado ${profitByFiat[0].realized.toFixed(2)}`
                    : undefined
                }
              />
            ) : (
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted">Lucro por moeda</div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {profitByFiat.map((p) => (
                    <div key={p.fiat} className="flex items-center justify-between text-sm">
                      <span className="text-muted">{p.fiat}</span>
                      <span className={`font-mono font-semibold ${p.total >= 0 ? 'text-positive' : 'text-negative'}`}>
                        {p.total.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {p.fiat}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <SectionCard title="Posições" icon={TrendingUp} action={<DataTag source="manual" />}>
            <PositionsTable lots={lotRows} marketPrices={marketPrices} />
          </SectionCard>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <TabLink onClick={() => setTab('quick')} label="Simulador rápido" />
            <TabLink onClick={() => setTab('multi')} label="Comparar anúncios" />
            <TabLink onClick={() => setTab('cycle')} label="Câmbio MZN⇄ZAR" />
            <TabLink onClick={() => setTab('records')} label="Registar compra/venda" />
          </div>
        </div>
      )}

      {tab === 'quick' && (
        <div className="flex flex-col gap-4">
          {sellableBalances.length > 0 ? (
            <WalletSaleSimulator
              balances={sellableBalances}
              marketPairs={marketPairsWithAge}
              mznRate={mznRate}
              zarRate={zarRate}
              walletFetchedAt={walletFetchedAt!}
              initialAsset={initialAsset}
              initialWallet={initialWallet}
              initialFiat={initialFiat}
              initialQuantity={initialQuantity}
            />
          ) : (
            !walletFetchError && (
              <EmptyState
                title="Sem saldo real disponível para simular venda"
                description="Assim que tiveres saldo num ativo com mercado rastreado (ex.: USDT) em Spot ou Funding, aparece aqui uma simulação de venda pronta a usar - ou chega cá diretamente a partir da Carteira."
              />
            )
          )}

          <QuickSimulator pairs={marketPairs} initialAmount={referenceAmount} />

          <SectionCard
            title="Calculadora avançada"
            subtitle="Planear um preço-alvo, teto de compra, ou quantidade a partir do lucro que queres."
          >
            <ProfitCalculator marketPairs={marketPairs} initialAsset={fromAdAsset} initialFiat={fromAdFiat} initialSide={fromAdSide} initialPrice={fromAdPrice} />
          </SectionCard>
        </div>
      )}

      {tab === 'multi' && (
        <MultiAdSimulator
          pairs={pairBooks}
          capitalSettings={capitalSettings}
          initialAmount={multiAdAmount ?? referenceAmount}
          initialPairIndex={multiAdPairIndex}
          watchedAdvertisers={watchedAdvertisers}
        />
      )}

      {tab === 'cycle' && <CurrencyCycle pairs={marketPairs} initialAmount={referenceAmount} />}

      {tab === 'records' && (
        <div className="flex flex-col gap-4">
          <SectionCard
            title="Registar compra"
            icon={ShoppingCart}
            subtitle="Separado do histórico sincronizado da Binance - regista aqui qualquer compra (Binance, outra plataforma, dinheiro) que queiras incluir na simulação."
            action={<DataTag source="manual" />}
          >
            <AddLotForm />
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
      )}
    </div>
  );
}

function TabLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border px-3 py-2 text-center text-xs text-muted hover:border-accent hover:text-accent"
    >
      {label}
    </button>
  );
}
