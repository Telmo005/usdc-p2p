import Link from 'next/link';
import { Star, Users, Megaphone } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getWatchlist } from '@/lib/watchlist';
import { getCustomerSummaries } from '@/lib/customers';
import { fetchPairBooks } from '@/lib/multiAdOpportunity';
import { TRACKED_PAIRS } from '@/lib/marketAnalysis';
import { toggleCounterpartyWatchAction, toggleAdvertiserWatchAction } from '@/app/actions/watchlist';
import { DataTag } from '@/components/DataTag';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

function fmtVolume(volumeByFiat: Array<{ fiat: string; totalValue: number }>) {
  if (volumeByFiat.length === 0) return '—';
  return volumeByFiat.map((v) => `${fmt(v.totalValue)} ${v.fiat}`).join(' · ');
}

type Sighting = { asset: string; fiat: string; role: 'a vender' | 'a comprar'; price: number; fetchedAt: number };

export default async function WatchlistPage() {
  const { user } = await requireUser();
  const [items, customers, books] = await Promise.all([
    getWatchlist(user.id),
    getCustomerSummaries(user.id),
    Promise.all(TRACKED_PAIRS.map((p) => fetchPairBooks(p.asset, p.fiat))),
  ]);

  const counterpartyItems = items.filter((i) => i.kind === 'counterparty');
  const advertiserItems = items.filter((i) => i.kind === 'advertiser');

  const watchedCustomers = counterpartyItems
    .map((i) => customers.find((c) => c.id === i.counterparty_id))
    .filter((c): c is NonNullable<typeof c> => c != null);

  // "Ainda visível agora?" - re-checks the live book instead of trusting a
  // stored snapshot, since nicknames aren't a real id and an ad's presence
  // changes constantly. No history table exists to say when they were last
  // seen, so absence is reported plainly, never with a fabricated "last
  // seen X ago".
  function findSightings(nickname: string): Sighting[] {
    const found: Sighting[] = [];
    for (const b of books) {
      const sellingAd = b.buyAds.find((a) => a.advertiserNickname === nickname);
      if (sellingAd) found.push({ asset: b.asset, fiat: b.fiat, role: 'a vender', price: sellingAd.price, fetchedAt: b.fetchedAt });
      const buyingAd = b.sellAds.find((a) => a.advertiserNickname === nickname);
      if (buyingAd) found.push({ asset: b.asset, fiat: b.fiat, role: 'a comprar', price: buyingAd.price, fetchedAt: b.fetchedAt });
    }
    return found;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Star size={18} />
        </span>
        <div>
          <h1 className="text-xl font-bold">Favoritos</h1>
          <p className="mt-1 text-sm text-muted">
            Contrapartes e anunciantes que marcaste para acompanhar - usa a ⭐ em Anúncios ou Contrapartes para adicionar.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Ainda não marcaste nada como favorito"
          description="Vai a Anúncios ou Contrapartes e usa a ⭐ junto de um anunciante ou de uma contraparte para o acompanhares aqui."
        />
      ) : (
        <>
          <SectionCard
            title="Contrapartes favoritas"
            icon={Users}
            subtitle={watchedCustomers.length > 0 ? `${watchedCustomers.length} contraparte${watchedCustomers.length === 1 ? '' : 's'}` : undefined}
          >
            {watchedCustomers.length === 0 ? (
              <EmptyState title="Nenhuma contraparte favorita" description="Marca uma contraparte em Contrapartes para a veres aqui." />
            ) : (
              <div className="flex flex-col gap-2">
                {watchedCustomers.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                    <div>
                      <Link href={`/customers/${c.id}`} className="font-medium text-accent hover:underline">
                        {c.nickname}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">
                        {c.orderCount} ordens ({c.buyCount} compra · {c.sellCount} venda) · {fmtVolume(c.volumeByFiat)}
                      </div>
                    </div>
                    <form action={toggleCounterpartyWatchAction}>
                      <input type="hidden" name="counterpartyId" value={c.id} />
                      <input type="hidden" name="watched" value="true" />
                      <button type="submit" className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:border-negative hover:text-negative">
                        <Star size={12} fill="currentColor" /> Remover
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Anunciantes favoritos"
            icon={Megaphone}
            subtitle={advertiserItems.length > 0 ? `${advertiserItems.length} anunciante${advertiserItems.length === 1 ? '' : 's'}` : undefined}
          >
            {advertiserItems.length === 0 ? (
              <EmptyState title="Nenhum anunciante favorito" description="Marca um anunciante em Anúncios para o veres aqui." />
            ) : (
              <div className="flex flex-col gap-2">
                {advertiserItems.map((item) => {
                  const nickname = item.advertiser_nickname!;
                  const sightings = findSightings(nickname);
                  return (
                    <div key={item.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{nickname}</span>
                        <form action={toggleAdvertiserWatchAction}>
                          <input type="hidden" name="nickname" value={nickname} />
                          <input type="hidden" name="watched" value="true" />
                          <button type="submit" className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:border-negative hover:text-negative">
                            <Star size={12} fill="currentColor" /> Remover
                          </button>
                        </form>
                      </div>
                      {sightings.length === 0 ? (
                        <p className="mt-1.5 text-xs text-muted">Não visível nos anúncios agora - pode ter fechado os anúncios ou não estar entre os mais bem posicionados neste momento.</p>
                      ) : (
                        <div className="mt-1.5 flex flex-col gap-1">
                          {sightings.map((s) => (
                            <div key={`${s.asset}-${s.fiat}-${s.role}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="text-muted">
                                {s.asset}/{s.fiat} · {s.role}
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-accent">
                                  {fmt(s.price, 4)} {s.fiat}
                                </span>
                                <DataTag source="binance_public" fetchedAt={s.fetchedAt} />
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
