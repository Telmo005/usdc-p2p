'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, RefreshCw, Star } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { DataTag } from '@/components/DataTag';
import { toggleAdvertiserWatchAction } from '@/app/actions/watchlist';
import { refreshPairBooksAction } from '@/app/actions/marketData';
import { formatAge, getFreshness } from '@/lib/dataQuality';
import type { P2PAd } from '@/lib/binancePublicP2P';
import type { PairBooks } from '@/lib/multiAdOpportunity';

export type AdBook = { asset: string; fiat: string; side: 'buy' | 'sell'; ads: P2PAd[] | null; error: string | null; fetchedAt: number };

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

/** Favoriting is per advertiser nickname, not per advNo - a live ad's own
 *  id churns constantly as it opens/closes, but the person behind it
 *  doesn't (see lib/watchlist.ts). stopPropagation keeps the star from
 *  also triggering the row's expand/collapse toggle. */
function WatchStarButton({ nickname, watched }: { nickname: string; watched: boolean }) {
  return (
    <form action={toggleAdvertiserWatchAction} onClick={(e) => e.stopPropagation()}>
      <input type="hidden" name="nickname" value={nickname} />
      <input type="hidden" name="watched" value={String(watched)} />
      <button
        type="submit"
        aria-label={watched ? 'Remover dos favoritos' : 'Marcar como favorito'}
        className={`rounded-lg p-1 hover:bg-surface-raised ${watched ? 'text-accent' : 'text-muted'}`}
      >
        <Star size={13} fill={watched ? 'currentColor' : 'none'} />
      </button>
    </form>
  );
}

function AdvertiserLine({ ad, watched, showFeeFree }: { ad: P2PAd; watched: boolean; showFeeFree: boolean }) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <WatchStarButton nickname={ad.advertiserNickname} watched={watched} />
        {ad.advertiserNickname}
        {ad.advertiserIsMerchant && <span className="rounded bg-accent/10 px-1 py-0.5 text-[10px] text-accent">merchant</span>}
        {showFeeFree && ad.hasNonMobileMoneyMethod && (
          <span className="rounded bg-positive/10 px-1 py-0.5 text-[10px] text-positive" title="Aceita pagamento além de M-Pesa/e-Mola - sem taxa de levantamento">
            sem taxa
          </span>
        )}
      </div>
      {(ad.advertiserOrderCount != null || ad.advertiserFinishRate != null) && (
        <div className="text-[11px] text-muted">
          {ad.advertiserOrderCount != null && `${ad.advertiserOrderCount} ordens/mês`}
          {ad.advertiserOrderCount != null && ad.advertiserFinishRate != null && ' · '}
          {ad.advertiserFinishRate != null && `${(ad.advertiserFinishRate * 100).toFixed(1)}% concluídas`}
        </div>
      )}
    </>
  );
}

function AdDetail({ ad, asset, fiat, side, counterpartyId }: { ad: P2PAd; asset: string; fiat: string; side: 'buy' | 'sell'; counterpartyId?: string }) {
  const simulateHref = `/simulation?asset=${asset}&fiat=${fiat}&side=${side}&price=${ad.price}`;

  return (
    <div className="rounded-lg border border-border bg-background p-4 text-sm">
      <div>
        <div className="mb-1 text-xs uppercase tracking-wide text-muted">Descrição / termos do anunciante</div>
        {ad.remarks ? (
          <p className="whitespace-pre-wrap text-sm">{ad.remarks}</p>
        ) : (
          <p className="text-sm italic text-muted">Descrição não disponibilizada pela fonte de dados.</p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted">Limite mínimo</div>
          <div className="font-mono">
            {fmt(ad.minSingleTransAmount)} {fiat}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Limite máximo</div>
          <div className="font-mono">
            {fmt(ad.maxSingleTransAmount)} {fiat}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Disponível</div>
          <div className="font-mono">
            {fmt(ad.availableQuantity, 4)} {asset}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Tempo para pagar</div>
          <div className="font-mono">{ad.payTimeLimitMinutes != null ? `${ad.payTimeLimitMinutes} min` : '—'}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 text-xs uppercase tracking-wide text-muted">Métodos de pagamento</div>
        <div className="flex flex-wrap gap-1.5">
          {ad.tradeMethods.map((m) => (
            <span key={m} className="rounded-full border border-border px-2 py-0.5 text-xs">
              {m}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 text-xs uppercase tracking-wide text-muted">Comerciante</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{ad.advertiserNickname}</span>
          {ad.advertiserIsMerchant && <span className="rounded bg-accent/10 px-1 py-0.5 text-[10px] text-accent">merchant</span>}
        </div>
        {(ad.advertiserOrderCount != null || ad.advertiserFinishRate != null) && (
          <div className="mt-0.5 text-xs text-muted">
            {ad.advertiserOrderCount != null && `${ad.advertiserOrderCount} ordens/mês`}
            {ad.advertiserOrderCount != null && ad.advertiserFinishRate != null && ' · '}
            {ad.advertiserFinishRate != null && `${(ad.advertiserFinishRate * 100).toFixed(1)}% concluídas`}
            <span className="ml-1">(estatísticas públicas da Binance, não calculadas por nós)</span>
          </div>
        )}
        {counterpartyId && (
          <Link href={`/customers/${counterpartyId}`} className="mt-1 inline-block text-xs text-accent hover:underline">
            Já negociaste com este comerciante → ver histórico
          </Link>
        )}
      </div>

      <p className="mt-3 text-[11px] text-muted">
        Histórico deste anúncio: ainda não disponível - este sistema regista o preço agregado do mercado (ver Início), não o
        histórico de anúncios individuais.
      </p>

      <div className="mt-3">
        <Link
          href={simulateHref}
          className="inline-flex items-center rounded-lg border border-accent/50 px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
        >
          Simular esta operação →
        </Link>
      </div>
    </div>
  );
}

export function AdsBrowser({
  books,
  counterpartyByNickname = {},
  watchedAdvertisers = [],
}: {
  books: AdBook[];
  counterpartyByNickname?: Record<string, string>;
  watchedAdvertisers?: string[];
}) {
  const pairs = [...new Set(books.map((b) => `${b.asset}/${b.fiat}`))];
  const [pair, setPair] = useState(pairs[0] ?? '');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [expandedAdvNo, setExpandedAdvNo] = useState<string | null>(null);
  const watchedSet = useMemo(() => new Set(watchedAdvertisers), [watchedAdvertisers]);

  // Manual/auto refresh (Phase 17) - same "additive override, freshest
  // wins" pattern as MultiAdSimulator: never replaces `books`, so a real
  // page navigation's fresh props are never shadowed by a stale refresh.
  const [overrides, setOverrides] = useState<Record<string, PairBooks>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const baseBook = books.find((b) => `${b.asset}/${b.fiat}` === pair && b.side === side);
  const [asset, fiat] = pair.split('/');
  const override = overrides[pair];
  const book: AdBook | undefined =
    override && override.fetchedAt > (baseBook?.fetchedAt ?? 0)
      ? { asset, fiat, side, ads: side === 'buy' ? override.buyAds : override.sellAds, error: override.error, fetchedAt: override.fetchedAt }
      : baseBook;
  // "sem taxa" only means something when I'm the one paying cash (side
  // 'buy' shows the ads I'd pay to) and only MZN has a real M-Pesa/e-Mola
  // withdrawal fee to avoid in the first place (lib/mpesaFees.ts).
  const showFeeFree = side === 'buy' && fiat === 'MZN';

  const toggle = (advNo: string) => setExpandedAdvNo((cur) => (cur === advNo ? null : advNo));

  const refreshInFlight = useRef(false);
  const handleRefresh = useCallback(async () => {
    const [a, f] = pair.split('/');
    if (!a || !f || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const fresh = await refreshPairBooksAction(a, f);
      if (fresh.error) setRefreshError(fresh.error);
      else setOverrides((prev) => ({ ...prev, [`${fresh.asset}/${fresh.fiat}`]: fresh }));
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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {pairs.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPair(p)}
              className={`rounded-full border px-3 py-1.5 text-xs ${pair === p ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'}`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-border bg-background p-1 text-xs">
          <button
            type="button"
            onClick={() => setSide('buy')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${side === 'buy' ? 'bg-accent text-accent-foreground' : 'text-muted'}`}
          >
            Quero comprar
          </button>
          <button
            type="button"
            onClick={() => setSide('sell')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${side === 'sell' ? 'bg-accent text-accent-foreground' : 'text-muted'}`}
          >
            Quero vender
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {side === 'buy'
            ? `Anúncios de quem está a vender ${asset} - é a estes preços que compras.`
            : `Anúncios de quem está a comprar ${asset} - é a estes preços que vendes.`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {book && !book.error && <DataTag source="binance_public" fetchedAt={book.fetchedAt} />}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-60"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'A atualizar...' : 'Atualizar'}
          </button>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-accent" />
            Automático (60s)
          </label>
          {book && (
            <span className={`text-xs ${getFreshness(book.fetchedAt, { delayedAfterMs: 30_000, staleAfterMs: 180_000 }) === 'stale' ? 'text-negative' : 'text-muted'}`}>
              Atualizado {formatAge(book.fetchedAt)}
            </span>
          )}
        </div>
      </div>

      {refreshError && (
        <p className="mt-2 text-xs text-negative">
          Não consegui atualizar os anúncios: {refreshError} - os dados abaixo são os últimos que consegui carregar, não os mais
          recentes.
        </p>
      )}

      <div className="mt-4">
        {!book || book.error ? (
          <ErrorBanner message={book?.error ?? 'Sem dados para este par.'} />
        ) : !book.ads || book.ads.length === 0 ? (
          <EmptyState title="Sem anúncios ativos agora" description="O livro de ofertas para este par/lado está vazio neste momento." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4"></th>
                    <th className="pb-2 pr-4">Anunciante</th>
                    <th className="pb-2 pr-4">Preço</th>
                    <th className="pb-2 pr-4">Disponível</th>
                    <th className="pb-2 pr-4">Limites</th>
                    <th className="pb-2">Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {book.ads.map((ad) => {
                    const expanded = expandedAdvNo === ad.advNo;
                    return (
                      <Fragment key={ad.advNo}>
                        <tr onClick={() => toggle(ad.advNo)} className="cursor-pointer border-t border-border hover:bg-surface-raised">
                          <td className="w-6 py-2 pl-1 text-muted">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                          <td className="py-2 pr-4">
                            <AdvertiserLine ad={ad} watched={watchedSet.has(ad.advertiserNickname)} showFeeFree={showFeeFree} />
                          </td>
                          <td className="py-2 pr-4 font-mono font-semibold text-accent">
                            {fmt(ad.price, 4)} {fiat}
                          </td>
                          <td className="py-2 pr-4 font-mono">
                            {fmt(ad.availableQuantity, 4)} {asset}
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs">
                            {fmt(ad.minSingleTransAmount)} - {fmt(ad.maxSingleTransAmount)} {fiat}
                          </td>
                          <td className="py-2 text-xs">{ad.tradeMethods.join(', ')}</td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={6} className="pb-3 pt-1">
                              <AdDetail ad={ad} asset={asset} fiat={fiat} side={side} counterpartyId={counterpartyByNickname[ad.advertiserNickname]} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2 md:hidden">
              {book.ads.map((ad) => {
                const expanded = expandedAdvNo === ad.advNo;
                return (
                  <div key={ad.advNo} className="rounded-lg border border-border text-xs">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggle(ad.advNo)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(ad.advNo)}
                      className="flex w-full flex-col gap-1 p-3 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          <WatchStarButton nickname={ad.advertiserNickname} watched={watchedSet.has(ad.advertiserNickname)} />
                          {ad.advertiserNickname}
                          {ad.advertiserIsMerchant && <span className="rounded bg-accent/10 px-1 py-0.5 text-[10px] text-accent">merchant</span>}
                          {showFeeFree && ad.hasNonMobileMoneyMethod && (
                            <span className="rounded bg-positive/10 px-1 py-0.5 text-[10px] text-positive">sem taxa</span>
                          )}
                        </span>
                        <span className="font-mono font-semibold text-accent">
                          {fmt(ad.price, 4)} {fiat}
                        </span>
                      </div>
                      {(ad.advertiserOrderCount != null || ad.advertiserFinishRate != null) && (
                        <div className="text-muted">
                          {ad.advertiserOrderCount != null && `${ad.advertiserOrderCount} ordens/mês`}
                          {ad.advertiserOrderCount != null && ad.advertiserFinishRate != null && ' · '}
                          {ad.advertiserFinishRate != null && `${(ad.advertiserFinishRate * 100).toFixed(1)}% concluídas`}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        <div>
                          <span className="text-muted">Disponível: </span>
                          {fmt(ad.availableQuantity, 4)} {asset}
                        </div>
                        <div>
                          <span className="text-muted">Limites: </span>
                          {fmt(ad.minSingleTransAmount)}-{fmt(ad.maxSingleTransAmount)}
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted">Pagamento: </span>
                          {ad.tradeMethods.join(', ')}
                        </div>
                      </div>
                    </div>
                    {expanded && (
                      <div className="border-t border-border p-3">
                        <AdDetail ad={ad} asset={asset} fiat={fiat} side={side} counterpartyId={counterpartyByNickname[ad.advertiserNickname]} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
