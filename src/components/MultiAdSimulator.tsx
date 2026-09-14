'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { planRoundTrip } from '@/lib/orderBookSimulator';
import { checkAdCompatibility, summarizeCompatibility, type BudgetMode } from '@/lib/budgetCompatibility';
import { refreshPairBooksAction } from '@/app/actions/marketData';
import { formatAge, getFreshness } from '@/lib/dataQuality';
import { X, Search, Star, ChevronDown, RefreshCw } from 'lucide-react';
import type { P2PAd } from '@/lib/binancePublicP2P';
import type { PairBooks } from '@/lib/multiAdOpportunity';
import type { CapitalSettings } from '@/lib/capitalSettings';
import { FillStepList } from '@/components/FillStepList';
import { DataTag } from '@/components/DataTag';

export type { PairBooks };

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

function AdPickerList({
  ads,
  fiat,
  asset,
  targetFiat,
  budgetMode,
  excludedNicknames,
  watchedSet,
  showFeeFreeAction,
  favoritesOnly,
  feeFreeOnly,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onToggleFavoritesOnly,
  onToggleFeeFreeOnly,
}: {
  ads: P2PAd[];
  fiat: string;
  asset: string;
  targetFiat: number;
  budgetMode: BudgetMode;
  excludedNicknames: Set<string>;
  watchedSet: Set<string>;
  showFeeFreeAction: boolean;
  /** Undefined = this list has no quick filters at all (sell side - filters
   *  only ever apply to the buy leg, per the user's own instruction: "os
   *  filtros devem ser apenas para compra"). Sell stays plain Todos/Nenhum
   *  + individual checkboxes. */
  favoritesOnly?: boolean;
  feeFreeOnly?: boolean;
  onToggle: (nickname: string) => void;
  onSelectAll: (ads: P2PAd[]) => void;
  onDeselectAll: (ads: P2PAd[]) => void;
  onToggleFavoritesOnly?: () => void;
  onToggleFeeFreeOnly?: () => void;
}) {
  const [search, setSearch] = useState('');
  const hasFilters = favoritesOnly !== undefined;
  const hasFavorites = ads.some((a) => watchedSet.has(a.advertiserNickname));
  const hasFeeFree = ads.some((a) => a.hasNonMobileMoneyMethod);
  // The book is now the real full order book (fetchFullP2POrderBook), not
  // just the first 20. Search and the two quick filters below all combine
  // (AND) to decide what's actually shown - "Todos"/"Nenhum" then act on
  // exactly that visible set, not the whole unfiltered book.
  const searchTerm = search.trim().toLowerCase();
  const visibleAds = ads.filter((a) => {
    if (searchTerm && !a.advertiserNickname.toLowerCase().includes(searchTerm)) return false;
    if (favoritesOnly && !watchedSet.has(a.advertiserNickname)) return false;
    if (feeFreeOnly && !a.hasNonMobileMoneyMethod) return false;
    return true;
  });
  return (
    <div className="flex-1 rounded-lg border border-border">
      <div className="flex flex-col gap-2 border-b border-border bg-background px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {ads.length} anúncios reais{visibleAds.length !== ads.length ? ` · ${visibleAds.length} visíveis` : ''}
          </span>
          <div className="relative">
            <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar..."
              className="w-32 rounded-md border border-border bg-surface py-1 pl-6 pr-2 text-[11px] outline-none focus:border-accent"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted">Seleção</span>
            <button type="button" onClick={() => onSelectAll(visibleAds)} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:text-foreground">
              Todos
            </button>
            <button type="button" onClick={() => onDeselectAll(visibleAds)} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:text-foreground">
              Nenhum
            </button>
          </div>
          {hasFilters && (hasFavorites || (showFeeFreeAction && hasFeeFree)) && (
            <div className="flex items-center gap-1.5 border-l border-border pl-3">
              <span className="text-[10px] uppercase tracking-wide text-muted">Filtros</span>
              {hasFavorites && (
                <button
                  type="button"
                  onClick={onToggleFavoritesOnly}
                  aria-pressed={favoritesOnly}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${favoritesOnly ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'}`}
                >
                  Só favoritos
                </button>
              )}
              {showFeeFreeAction && hasFeeFree && (
                <button
                  type="button"
                  onClick={onToggleFeeFreeOnly}
                  aria-pressed={feeFreeOnly}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${feeFreeOnly ? 'border-positive bg-positive/10 text-positive' : 'border-positive/40 text-positive hover:bg-positive/10'}`}
                >
                  Sem M-Pesa/e-Mola
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {ads.length === 0 ? (
        <p className="p-3 text-xs text-muted">Sem anúncios reais neste momento.</p>
      ) : visibleAds.length === 0 ? (
        <p className="p-3 text-xs text-muted">
          {searchTerm ? `Nenhum anunciante corresponde a "${search}".` : 'Nenhum anunciante corresponde aos filtros ativos.'}
        </p>
      ) : (
        <div className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto">
          {visibleAds.map((ad) => {
            const watched = watchedSet.has(ad.advertiserNickname);
            const { compatible, reason } = checkAdCompatibility(ad, targetFiat);
            const disabledByBudget = budgetMode === 'respect_budget' && !compatible;
            const checked = !excludedNicknames.has(ad.advertiserNickname) && !disabledByBudget;
            return (
              <label
                key={ad.advNo}
                className={`flex flex-col gap-0.5 px-3 py-2 text-xs ${disabledByBudget ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-surface-raised'}`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabledByBudget}
                    onChange={() => onToggle(ad.advertiserNickname)}
                    className="accent-accent"
                  />
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
                </div>
                {!compatible && reason && (
                  <div className={`pl-6 text-[11px] ${budgetMode === 'respect_budget' ? 'text-negative' : 'text-info'}`}>
                    {budgetMode === 'respect_budget' ? '❌' : '⚠️'} {reason}
                  </div>
                )}
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
  // Starts unchecked - with "Sem M-Pesa/e-Mola" also defaulting on, there's
  // nothing to discount initially anyway. Left as a real, always-visible
  // choice (just disabled, never hidden, while it has no effect) so
  // turning that filter off and using a fee-charging merchant is still one
  // click away, not a control that reappears out of nowhere.
  const [useMpesaFee, setUseMpesaFee] = useState(false);
  const [budgetMode, setBudgetMode] = useState<BudgetMode>('no_restriction');
  // Keyed by the advertiser's nickname, not the ad's own advNo - the
  // nickname is the stable identity (same choice already made for
  // Favoritos, lib/watchlist.ts). Two ads from the same advertiser now
  // always share one checked state, and a merchant that briefly
  // disappears and reappears under a new advNo doesn't silently reset.
  const [excludedNicknames, setExcludedNicknames] = useState<Set<string>>(new Set());
  // Persistent, combinable quick filters (not one-shot bulk actions) - "só
  // favoritos" and "sem M-Pesa/e-Mola" can both be on at once, hide
  // non-matching ads from the picker, AND narrow what the plan actually
  // uses (see buyAdsForPlan below). Buy only - "os filtros devem ser
  // apenas para compra": sell stays plain Todos/Nenhum + manual checkboxes.
  // "Sem M-Pesa/e-Mola" defaults ON - the whole point of that fee is that
  // it's avoidable, so the default view already shows the full-profit path.
  const [buyFavoritesOnly, setBuyFavoritesOnly] = useState(false);
  const [buyFeeFreeOnly, setBuyFeeFreeOnly] = useState(true);
  const watchedSet = useMemo(() => new Set(watchedAdvertisers), [watchedAdvertisers]);

  // Manual/auto refresh (Phase 17) - a purely additive "last known good"
  // override per pair, never a replacement of the `pairs` prop itself.
  // Deriving `pair` this way (never an effect) means a real page
  // navigation's fresh props are never shadowed by a stale override: the
  // one with the newer fetchedAt simply wins on every render.
  const [overrides, setOverrides] = useState<Record<string, PairBooks>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const basePair = pairs[pairIdx];
  const override = basePair ? overrides[`${basePair.asset}-${basePair.fiat}`] : undefined;
  const pair = override && override.fetchedAt > (basePair?.fetchedAt ?? 0) ? override : basePair;
  const targetFiat = Number(amount);
  const mpesaApplicable = pair?.fiat === 'MZN';

  const buyAdsForPlan = useMemo(() => {
    if (!pair) return [];
    let list = pair.buyAds.filter((a) => !excludedNicknames.has(a.advertiserNickname));
    if (buyFavoritesOnly) list = list.filter((a) => watchedSet.has(a.advertiserNickname));
    // Only meaningful for MZN (mpesaApplicable) - guards against silently
    // filtering ZAR's buy list on a flag the UI never even shows there.
    if (buyFeeFreeOnly && mpesaApplicable) list = list.filter((a) => a.hasNonMobileMoneyMethod);
    return budgetMode === 'respect_budget' ? list.filter((a) => checkAdCompatibility(a, targetFiat).compatible) : list;
  }, [pair, excludedNicknames, buyFavoritesOnly, buyFeeFreeOnly, mpesaApplicable, watchedSet, budgetMode, targetFiat]);

  // No quick filters on the sell leg ("os filtros devem ser apenas para
  // compra") - every real ad participates unless manually unchecked.
  const sellAdsForPlan = useMemo(() => {
    if (!pair) return [];
    const list = pair.sellAds.filter((a) => !excludedNicknames.has(a.advertiserNickname));
    return budgetMode === 'respect_budget' ? list.filter((a) => checkAdCompatibility(a, targetFiat).compatible) : list;
  }, [pair, excludedNicknames, budgetMode, targetFiat]);

  const plan = useMemo(() => {
    if (!pair || !(targetFiat > 0)) return null;
    return planRoundTrip(buyAdsForPlan, sellAdsForPlan, targetFiat, capitalSettings, mpesaApplicable && useMpesaFee);
  }, [pair, targetFiat, capitalSettings, mpesaApplicable, useMpesaFee, buyAdsForPlan, sellAdsForPlan]);

  const clearSimulation = () => {
    setAmount(String(initialAmount ?? 1000));
    setUseMpesaFee(false);
    setExcludedNicknames(new Set());
    setBudgetMode('no_restriction');
    setBuyFavoritesOnly(false);
    setBuyFeeFreeOnly(true);
  };

  // Guards against overlapping refreshes with a ref (not state) so it never
  // needs to sit in a dependency array. A failed refresh sets refreshError
  // and leaves `overrides` untouched - the old ads stay on screen exactly
  // as they were, never silently replaced by an empty result.
  const refreshInFlight = useRef(false);
  const handleRefresh = useCallback(async () => {
    if (!pair || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const fresh = await refreshPairBooksAction(pair.asset, pair.fiat);
      if (fresh.error) setRefreshError(fresh.error);
      else setOverrides((prev) => ({ ...prev, [`${fresh.asset}-${fresh.fiat}`]: fresh }));
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Falha ao atualizar os anúncios.');
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, [pair]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') handleRefresh();
    }, 60_000);
    return () => clearInterval(interval);
  }, [autoRefresh, handleRefresh]);

  const toggleAd = (nickname: string) => {
    setExcludedNicknames((prev) => {
      const next = new Set(prev);
      if (next.has(nickname)) next.delete(nickname);
      else next.add(nickname);
      return next;
    });
  };

  const selectAll = (ads: P2PAd[]) => {
    setExcludedNicknames((prev) => {
      const next = new Set(prev);
      for (const a of ads) next.delete(a.advertiserNickname);
      return next;
    });
  };

  const deselectAll = (ads: P2PAd[]) => {
    setExcludedNicknames((prev) => {
      const next = new Set(prev);
      for (const a of ads) next.add(a.advertiserNickname);
      return next;
    });
  };

  // Turning a filter ON also clears exclusion for everyone it (and any
  // other already-active filter) matches right now, so "Só favoritos"
  // really does mean "favoritos estão selecionados" immediately, not just
  // "favoritos estão visíveis." Turning it OFF only stops hiding rows -
  // whatever got checked/unchecked meanwhile is left exactly as it is.
  const includeMatching = (ads: P2PAd[], predicate: (a: P2PAd) => boolean) => {
    setExcludedNicknames((prev) => {
      const next = new Set(prev);
      for (const a of ads) if (predicate(a)) next.delete(a.advertiserNickname);
      return next;
    });
  };

  const toggleBuyFavoritesOnly = () => {
    setBuyFavoritesOnly((prev) => {
      const next = !prev;
      if (next && pair) {
        includeMatching(pair.buyAds, (a) => watchedSet.has(a.advertiserNickname) && (!buyFeeFreeOnly || a.hasNonMobileMoneyMethod));
      }
      return next;
    });
  };

  const toggleBuyFeeFreeOnly = () => {
    setBuyFeeFreeOnly((prev) => {
      const next = !prev;
      if (next && pair) {
        includeMatching(pair.buyAds, (a) => a.hasNonMobileMoneyMethod && (!buyFavoritesOnly || watchedSet.has(a.advertiserNickname)));
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
  // "Sem M-Pesa/e-Mola" (default on) already means every ad actually used
  // is fee-free - the discount checkbox would have zero effect then, so it
  // only makes sense to show as an active control when at least one real
  // step in the current plan would actually be charged.
  const hasFeeChargingStep = plan ? plan.buy.steps.some((s) => !s.hasNonMobileMoneyMethod) : false;

  // Reflects every active filter (manual exclusion, favoritos, sem taxa,
  // orçamento) since it's derived from the exact same list the plan uses.
  const buySelectedCount = buyAdsForPlan.length;
  const sellSelectedCount = sellAdsForPlan.length;
  const buyBudget = summarizeCompatibility(pair.buyAds, targetFiat);
  const sellBudget = summarizeCompatibility(pair.sellAds, targetFiat);
  const usedLabel = budgetMode === 'respect_budget' ? 'compatíveis' : 'selecionados';

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

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">Restrição de orçamento</span>
          <div className="flex rounded-lg border border-border bg-background p-1 text-xs">
            <button
              type="button"
              onClick={() => setBudgetMode('no_restriction')}
              className={`rounded-md px-3 py-1.5 font-medium transition ${budgetMode === 'no_restriction' ? 'bg-accent text-accent-foreground' : 'text-muted'}`}
            >
              Sem restrição
            </button>
            <button
              type="button"
              onClick={() => setBudgetMode('respect_budget')}
              className={`rounded-md px-3 py-1.5 font-medium transition ${budgetMode === 'respect_budget' ? 'bg-accent text-accent-foreground' : 'text-muted'}`}
            >
              Respeitar meu orçamento
            </button>
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

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-60"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'A atualizar...' : 'Atualizar anúncios'}
        </button>

        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-accent" />
          Atualizar automaticamente a cada 60s
        </label>

        <span className={`text-xs ${getFreshness(pair.fetchedAt, { delayedAfterMs: 30_000, staleAfterMs: 180_000 }) === 'stale' ? 'text-negative' : 'text-muted'}`}>
          Atualizado {formatAge(pair.fetchedAt)}
        </span>
      </div>

      {refreshError && (
        <p className="mt-2 text-xs text-negative">
          Não consegui atualizar os anúncios: {refreshError} - os dados abaixo são os últimos que consegui carregar, não os mais
          recentes.
        </p>
      )}

      <p className="mt-3 text-xs text-muted">
        Comerciantes analisados: {pair.buyAds.length} compra / {pair.sellAds.length} venda · Selecionados: {buySelectedCount} /{' '}
        {sellSelectedCount}
        {budgetMode === 'respect_budget' && (
          <>
            {' '}
            · Compatíveis com o orçamento: {buyBudget.compatible} / {sellBudget.compatible} · Fora do orçamento:{' '}
            {buyBudget.incompatible} / {sellBudget.incompatible}
          </>
        )}
      </p>

      {mpesaApplicable && (
        <label className="mt-3 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={useMpesaFee} onChange={(e) => setUseMpesaFee(e.target.checked)} className="accent-accent" />
          Descontar taxa real de levantamento M-Pesa por comerciante (cada um cobra o seu próprio custo)
          {!hasFeeChargingStep && (
            <span className="text-[11px] italic">- sem efeito agora: nenhum comerciante usado neste plano cobra esta taxa</span>
          )}
        </label>
      )}

      <details className="group mt-3 rounded-lg border border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-muted marker:hidden group-open:text-foreground">
          <span className="flex items-center gap-1.5">
            <ChevronDown size={13} className="transition group-open:rotate-180" /> Escolher comerciantes (opcional)
          </span>
          <span className="text-accent">
            A usar {buyAdsForPlan.length} {usedLabel} (compra) · {sellAdsForPlan.length} (venda)
          </span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-border p-3 sm:flex-row">
          <div className="flex-1">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Vou comprar de</div>
            <AdPickerList
              ads={pair.buyAds}
              fiat={pair.fiat}
              asset={pair.asset}
              targetFiat={targetFiat}
              budgetMode={budgetMode}
              excludedNicknames={excludedNicknames}
              watchedSet={watchedSet}
              showFeeFreeAction={mpesaApplicable}
              favoritesOnly={buyFavoritesOnly}
              feeFreeOnly={buyFeeFreeOnly}
              onToggle={toggleAd}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              onToggleFavoritesOnly={toggleBuyFavoritesOnly}
              onToggleFeeFreeOnly={toggleBuyFeeFreeOnly}
            />
          </div>
          <div className="flex-1">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Vou vender para</div>
            <AdPickerList
              ads={pair.sellAds}
              fiat={pair.fiat}
              asset={pair.asset}
              targetFiat={targetFiat}
              budgetMode={budgetMode}
              excludedNicknames={excludedNicknames}
              watchedSet={watchedSet}
              showFeeFreeAction={false}
              onToggle={toggleAd}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
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
                Só consegui cobrir {fmt(plan.buy.filledFiat)} de {fmt(targetFiat)} {pair.fiat} com os anúncios {usedLabel} agora -
                faltam {fmt(buyShortfall)} {pair.fiat}.
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
                {fmt(plan.unsoldQuantity, 4)} {pair.asset} comprados não têm comprador ao preço atual nos anúncios {usedLabel} agora -
                ficam por vender nesta simulação.
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
