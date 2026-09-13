'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import type { P2PAd } from '@/lib/binancePublicP2P';

export type AdBook = { asset: string; fiat: string; side: 'buy' | 'sell'; ads: P2PAd[] | null; error: string | null };

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

export function AdsBrowser({ books }: { books: AdBook[] }) {
  const pairs = [...new Set(books.map((b) => `${b.asset}/${b.fiat}`))];
  const [pair, setPair] = useState(pairs[0] ?? '');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');

  const book = books.find((b) => `${b.asset}/${b.fiat}` === pair && b.side === side);
  const [asset, fiat] = pair.split('/');

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
      <p className="mt-2 text-xs text-muted">
        {side === 'buy'
          ? `Anúncios de quem está a vender ${asset} - é a estes preços que compras.`
          : `Anúncios de quem está a comprar ${asset} - é a estes preços que vendes.`}
      </p>

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
                    <th className="pb-2 pr-4">Anunciante</th>
                    <th className="pb-2 pr-4">Preço</th>
                    <th className="pb-2 pr-4">Disponível</th>
                    <th className="pb-2 pr-4">Limites</th>
                    <th className="pb-2">Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {book.ads.map((ad) => (
                    <tr key={ad.advNo} className="border-t border-border">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          {ad.advertiserNickname}
                          {ad.advertiserIsMerchant && <span className="rounded bg-accent/10 px-1 py-0.5 text-[10px] text-accent">merchant</span>}
                        </div>
                        {(ad.advertiserOrderCount != null || ad.advertiserFinishRate != null) && (
                          <div className="text-[11px] text-muted">
                            {ad.advertiserOrderCount != null && `${ad.advertiserOrderCount} ordens/mês`}
                            {ad.advertiserOrderCount != null && ad.advertiserFinishRate != null && ' · '}
                            {ad.advertiserFinishRate != null && `${(ad.advertiserFinishRate * 100).toFixed(1)}% concluídas`}
                          </div>
                        )}
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
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2 md:hidden">
              {book.ads.map((ad) => (
                <div key={ad.advNo} className="rounded-lg border border-border p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {ad.advertiserNickname}
                      {ad.advertiserIsMerchant && <span className="rounded bg-accent/10 px-1 py-0.5 text-[10px] text-accent">merchant</span>}
                    </span>
                    <span className="font-mono font-semibold text-accent">
                      {fmt(ad.price, 4)} {fiat}
                    </span>
                  </div>
                  {(ad.advertiserOrderCount != null || ad.advertiserFinishRate != null) && (
                    <div className="mt-1 text-muted">
                      {ad.advertiserOrderCount != null && `${ad.advertiserOrderCount} ordens/mês`}
                      {ad.advertiserOrderCount != null && ad.advertiserFinishRate != null && ' · '}
                      {ad.advertiserFinishRate != null && `${(ad.advertiserFinishRate * 100).toFixed(1)}% concluídas`}
                    </div>
                  )}
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
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
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
