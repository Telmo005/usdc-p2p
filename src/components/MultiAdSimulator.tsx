'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { planRoundTrip } from '@/lib/orderBookSimulator';
import { X, Search, Star, ChevronDown } from 'lucide-react';
import type { P2PAd } from '@/lib/binancePublicP2P';
import type { CapitalSettings } from '@/lib/capitalSettings';
import { FillStepList } from '@/components/FillStepList';
import { DataTag } from '@/components/DataTag';

export type PairBooks = { asset: string; fiat: string; buyAds: P2PAd[]; sellAds: P2PAd[]; fetchedAt: number };

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

function AdPickerList({
  ads,
  fiat,
  asset,
  excludedAdvNos,
  watchedSet,
  showFeeFreeAction,
  onToggle,
  onSelectAll,
  onFavoritesOnly,
  onFeeFreeOnly,
}: {
  ads: P2PAd[];
  fiat: string;
  asset: string;
  excludedAdvNos: Set<string>;
  watchedSet: Set<string>;
  showFeeFreeAction: boolean;
  onToggle: (advNo: string) => void;
  onSelectAll: () => void;
  onFavoritesOnly: () => void;
  onFeeFreeOnly: () => void;
}) {
  const hasFavorites = ads.some((a) => watchedSet.has(a.advertiserNickname));
  const hasFeeFree = ads.some((a) => a.hasNonMobileMoneyMethod);
  return (
    <div className="flex-1 rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-background px-3 py-2">
        <span className="text-xs text-muted">{ads.length} anúncios reais</span>
        <div className="flex flex-wrap justify-end gap-1.5">
          <button type="button" onClick={onSelectAll} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:text-foreground">
            Todos
          </button>
          {hasFavorites && (
            <button type="button" onClick={onFavoritesOnly} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:text-foreground">
              Só favoritos
            </button>
          )}
          {showFeeFreeAction && hasFeeFree && (
            <button type="button" onClick={onFeeFreeOnly} className="rounded-full border border-positive/40 px-2 py-0.5 text-[11px] text-positive hover:bg-positive/10">
              Sem M-Pesa/e-Mola
            </button>
          )}
        </div>
      </div>
      {ads.length === 0 ? (
        <p className="p-3 text-xs text-muted">Sem anúncios reais neste momento.</p>
      ) : (
        <div className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto">
          {ads.map((ad) => {
            const checked = !excludedAdvNos.has(ad.advNo);
            const watched = watchedSet.has(ad.advertiserNickname);
            return (
              <label key={ad.advNo} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-surface-raised">
                <input type="checkbox" checked={checked} onChange={() => onToggle(ad.advNo)} className="accent-accent" />
                {watched && <Star size={11} className="shrink-0 text-accent" fill="currentColor" />}
                <span className="flex-1 truncate">
                  {ad.advertiserNickname}
                  {ad.advertiserIsMerchant && <span className="ml-1.5 rounded bg-accent/10 px-1 py-0.5 text-[10px] text-accent">merchant</span>}
                  {showFeeFreeAction && ad.hasNonMobileMoneyMethod && (
                    <span className="ml-1.5 rounded bg-positive/10 px-1 py-0.5 text-[10px] text-positive">sem taxa</span>
                  )}
                </span>
                <span className="shrink-0 font-mono font-semibold text-accent">
                  {fmt(ad.price, 4)} {fiat}
                </span>
                <span className="hidden shrink-0 font-mono text-muted sm:inline">
                  {fmt(ad.availableQuantity, 2)} {asset}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * "With whom do I buy, with whom do I sell, what's the real profit" - for
 * amounts no single advertiser can fill alone. Every other simulator here
 * prices a trade at one aggregate number; this walks the real ad list
 * (already best-price-first) and builds a real multi-advertiser plan
 * instead (see lib/orderBookSimulator.ts). Manual only - "qual seria o
 * valor ideal" is a search, and that search now lives in the Opportunity
 * Center (lib/multiAdOpportunity.ts), not here.
 */
export function MultiAdSimulator({
  pairs,
  capitalSettings,
  initialAmount,
  initialPairIndex,
  watchedAdvertisers = [],
}: {
  pairs: PairBooks[];
  capitalSettings: CapitalSettings;
  initialAmount?: number;
  initialPairIndex?: number;
  watchedAdvertisers?: string[];
}) {
  const [pairIdx, setPairIdx] = useState(
    initialPairIndex != null && initialPairIndex >= 0 && initialPairIndex < pairs.length ? initialPairIndex : 0
  );
  const [amount, setAmount] = useState(String(initialAmount ?? 1000));
  const [useMpesaFee, setUseMpesaFee] = useState(true);
  // Keyed by the ad's own advNo (unique and stable for this page load) -
  // "excluded" rather than "included" means every real ad participates by
  // default (today's behavior) with no initialization, and switching pair
  // tabs "just works": a different pair's ads have entirely different
  // advNos, so old exclusions simply don't match anything there.
  const [excludedAdvNos, setExcludedAdvNos] = useState<Set<string>>(new Set());
  const watchedSet = useMemo(() => new Set(watchedAdvertisers), [watchedAdvertisers]);

  const pair = pairs[pairIdx];
  const targetFiat = Number(amount);
  const mpesaApplicable = pair?.fiat === 'MZN';

  const filteredBuyAds = useMemo(() => (pair ? pair.buyAds.filter((a) => !excludedAdvNos.has(a.advNo)) : []), [pair, excludedAdvNos]);
  const filteredSellAds = useMemo(() => (pair ? pair.sellAds.filter((a) => !excludedAdvNos.has(a.advNo)) : []), [pair, excludedAdvNos]);

  const plan = useMemo(() => {
    if (!pair || !(targetFiat > 0)) return null;
    return planRoundTrip(filteredBuyAds, filteredSellAds, targetFiat, capitalSettings, mpesaApplicable && useMpesaFee);
  }, [pair, targetFiat, capitalSettings, mpesaApplicable, useMpesaFee, filteredBuyAds, filteredSellAds]);

  const clearSimulation = () => {
    setAmount(String(initialAmount ?? 1000));
    setUseMpesaFee(true);
    setExcludedAdvNos(new Set());
  };

  const toggleAd = (advNo: string) => {
    setExcludedAdvNos((prev) => {
      const next = new Set(prev);
      if (next.has(advNo)) next.delete(advNo);
      else next.add(advNo);
      return next;
    });
  };

  const selectAll = (ads: P2PAd[]) => {
    setExcludedAdvNos((prev) => {
      const next = new Set(prev);
      for (const a of ads) next.delete(a.advNo);
      return next;
    });
  };

  const favoritesOnly = (ads: P2PAd[]) => {
    setExcludedAdvNos((prev) => {
      const next = new Set(prev);
      for (const a of ads) {
        if (watchedSet.has(a.advertiserNickname)) next.delete(a.advNo);
        else next.add(a.advNo);
      }
      return next;
    });
  };

  const feeFreeOnly = (ads: P2PAd[]) => {
    setExcludedAdvNos((prev) => {
      const next = new Set(prev);
      for (const a of ads) {
        if (a.hasNonMobileMoneyMethod) next.delete(a.advNo);
        else next.add(a.advNo);
      }
      return next;
    });
  };

  if (pairs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
        Sem anúncios reais disponíveis neste momento para simular com profundidade.
      </div>
    );
  }

  const buyShortfall = plan ? Math.max(0, targetFiat - plan.buy.filledFiat) : 0;
  // Câmbio efetivo: quanto cada USDT custou/rendeu de facto, taxas incluídas -
  // não o preço de tabela de um único anúncio, o preço real médio pago aos
  // vários comerciantes (buy.avgPrice/sell.avgPrice) com todos os custos
  // (configurados + M-Pesa) somados ao lado da compra, onde são cobrados.
  const effectiveBuyRate = plan && plan.buy.filledQuantity > 0 ? (plan.buy.filledFiat + plan.configuredCosts + plan.mpesaFee) / plan.buy.filledQuantity : null;

  const buySelectedCount = pair.buyAds.length - pair.buyAds.filter((a) => excludedAdvNos.has(a.advNo)).length;
  const sellSelectedCount = pair.sellAds.length - pair.sellAds.filter((a) => excludedAdvNos.has(a.advNo)).length;
  const hasCustomSelection = buySelectedCount < pair.buyAds.length || sellSelectedCount < pair.sellAds.length;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">Simular compra em vários anúncios</h2>
      <p className="mt-1 text-xs text-muted">
        Para um valor que nenhum anunciante sozinho consegue cobrir - usa os anúncios reais, um a um, não a média do mercado.
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <Search size={12} />
        Não sabes que valor simular? Vê as combinações que o sistema já testou em{' '}
        <Link href="/opportunities" className="font-medium text-accent hover:underline">
          Oportunidades
        </Link>
        .
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">Vou investir</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-40 rounded-lg border border-border bg-background px-3 py-2.5 text-lg font-semibold outline-none focus:border-accent"
            />
            <span className="text-sm text-muted">{pair.fiat}</span>
          </div>
        </label>

        <button
          type="button"
          onClick={clearSimulation}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted hover:border-negative hover:text-negative"
        >
          <X size={13} /> Limpar simulação
        </button>

        {pairs.length > 1 && (
          <div className="flex gap-1.5">
            {pairs.map((p, i) => (
              <button
                key={`${p.asset}-${p.fiat}`}
                type="button"
                onClick={() => setPairIdx(i)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  i === pairIdx ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'
                }`}
              >
                {p.asset}/{p.fiat}
              </button>
            ))}
          </div>
        )}

        <DataTag source="binance_public" fetchedAt={pair.fetchedAt} />
      </div>

      {mpesaApplicable && (
        <label className="mt-3 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={useMpesaFee} onChange={(e) => setUseMpesaFee(e.target.checked)} className="accent-accent" />
          Descontar taxa real de levantamento M-Pesa por comerciante (cada um cobra o seu próprio custo)
        </label>
      )}

      <details className="group mt-3 rounded-lg border border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-muted marker:hidden group-open:text-foreground">
          <span className="flex items-center gap-1.5">
            <ChevronDown size={13} className="transition group-open:rotate-180" /> Escolher comerciantes (opcional)
          </span>
          {hasCustomSelection && (
            <span className="text-accent">
              A usar {buySelectedCount} de {pair.buyAds.length} (compra) · {sellSelectedCount} de {pair.sellAds.length} (venda)
            </span>
          )}
        </summary>
        <div className="flex flex-col gap-3 border-t border-border p-3 sm:flex-row">
          <div className="flex-1">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Vou comprar de</div>
            <AdPickerList
              ads={pair.buyAds}
              fiat={pair.fiat}
              asset={pair.asset}
              excludedAdvNos={excludedAdvNos}
              watchedSet={watchedSet}
              showFeeFreeAction={mpesaApplicable}
              onToggle={toggleAd}
              onSelectAll={() => selectAll(pair.buyAds)}
              onFavoritesOnly={() => favoritesOnly(pair.buyAds)}
              onFeeFreeOnly={() => feeFreeOnly(pair.buyAds)}
            />
          </div>
          <div className="flex-1">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Vou vender para</div>
            <AdPickerList
              ads={pair.sellAds}
              fiat={pair.fiat}
              asset={pair.asset}
              excludedAdvNos={excludedAdvNos}
              watchedSet={watchedSet}
              showFeeFreeAction={false}
              onToggle={toggleAd}
              onSelectAll={() => selectAll(pair.sellAds)}
              onFavoritesOnly={() => favoritesOnly(pair.sellAds)}
              onFeeFreeOnly={() => feeFreeOnly(pair.sellAds)}
            />
          </div>
        </div>
      </details>

      {plan && (
        <>
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              Comprar de ({fmt(plan.buy.filledFiat)} {pair.fiat} de {fmt(targetFiat)} {pair.fiat})
            </div>
            <FillStepList steps={plan.buy.steps} asset={pair.asset} fiat={pair.fiat} showMpesaFee={mpesaApplicable && useMpesaFee} />
            {buyShortfall > 0 && (
              <p className="mt-1.5 text-xs text-negative">
                Só consegui cobrir {fmt(plan.buy.filledFiat)} de {fmt(targetFiat)} {pair.fiat} com os anúncios{' '}
                {hasCustomSelection ? 'selecionados' : 'visíveis'} agora - faltam {fmt(buyShortfall)} {pair.fiat}.
              </p>
            )}
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              Vender para ({fmt(plan.sell.filledQuantity, 4)} {pair.asset})
            </div>
            <FillStepList steps={plan.sell.steps} asset={pair.asset} fiat={pair.fiat} />
            {plan.unsoldQuantity > 0 && (
              <p className="mt-1.5 text-xs text-negative">
                {fmt(plan.unsoldQuantity, 4)} {pair.asset} comprados não têm comprador ao preço atual nos anúncios{' '}
                {hasCustomSelection ? 'selecionados' : 'visíveis'} agora - ficam por vender nesta simulação.
              </p>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <div className="mb-3 flex justify-end">
              <DataTag source="simulated" />
            </div>

            {plan.buy.avgPrice != null && plan.sell.avgPrice != null && (
              <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-border pb-4">
                <div>
                  <div className="text-xs text-muted">Câmbio de compra</div>
                  <div className="font-mono text-sm">
                    {fmt(plan.buy.avgPrice, 4)} {pair.fiat}/{pair.asset}
                  </div>
                  {effectiveBuyRate != null && (
                    <div className="text-xs text-muted">
                      com taxas: <span className="font-mono font-semibold text-foreground">{fmt(effectiveBuyRate, 4)} {pair.fiat}/{pair.asset}</span>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted">Câmbio de venda</div>
                  <div className="font-mono text-sm font-semibold">
                    {fmt(plan.sell.avgPrice, 4)} {pair.fiat}/{pair.asset}
                  </div>
                </div>
                {effectiveBuyRate != null && (
                  <div>
                    <div className="text-xs text-muted">Câmbio final (com taxas)</div>
                    <div className={`font-mono text-sm font-semibold ${plan.sell.avgPrice >= effectiveBuyRate ? 'text-positive' : 'text-negative'}`}>
                      {fmt(effectiveBuyRate, 4)} → {fmt(plan.sell.avgPrice, 4)} {pair.fiat}/{pair.asset}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <div className="text-xs text-muted">Resultado bruto</div>
                <div className="font-mono text-lg font-semibold">
                  {fmt(plan.grossResult)} {pair.fiat}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Custos</div>
                <div className="font-mono text-lg font-semibold">
                  {fmt(plan.configuredCosts + plan.mpesaFee)} {pair.fiat}
                </div>
                {plan.mpesaFee > 0 && <div className="text-[11px] text-muted">inclui {fmt(plan.mpesaFee)} {pair.fiat} de levantamento M-Pesa</div>}
              </div>
              <div>
                <div className="text-xs text-muted">Resultado líquido</div>
                <div className={`font-mono text-xl font-bold ${plan.netResult >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {plan.netResult >= 0 ? '+' : ''}
                  {fmt(plan.netResult)} {pair.fiat}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
