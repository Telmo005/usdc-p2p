import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, User, Star } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getCustomerDetail } from '@/lib/customers';
import { getWatchedCounterpartyIds } from '@/lib/watchlist';
import { toggleCounterpartyWatchAction } from '@/app/actions/watchlist';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { SectionCard } from '@/components/ui/SectionCard';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  const [customer, watchedIds] = await Promise.all([getCustomerDetail(user.id, id), getWatchedCounterpartyIds(user.id)]);
  if (!customer) notFound();
  const watched = watchedIds.includes(id);

  const avgTicket =
    customer.volumeByFiat.length === 1 && customer.orderCount > 0 ? customer.volumeByFiat[0].totalValue / customer.orderCount : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/customers" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent">
          <ArrowLeft size={12} /> Contrapartes
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
            <User size={18} />
          </span>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{customer.nickname}</h1>
            <p className="text-sm text-muted">
              Contraparte desde {new Date(customer.firstSeenAt).toLocaleDateString('pt-PT')} · última negociação{' '}
              {new Date(customer.lastSeenAt).toLocaleDateString('pt-PT')}
            </p>
          </div>
          <form action={toggleCounterpartyWatchAction}>
            <input type="hidden" name="counterpartyId" value={id} />
            <input type="hidden" name="watched" value={String(watched)} />
            <button
              type="submit"
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${
                watched ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'
              }`}
            >
              <Star size={13} fill={watched ? 'currentColor' : 'none'} />
              {watched ? 'Favorito' : 'Marcar como favorito'}
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Ordens concluídas" value={String(customer.orderCount)} sub={`${customer.buyCount} compra · ${customer.sellCount} venda`} />
        {customer.volumeByFiat.map((v) => (
          <StatCard key={v.fiat} label={`Volume (${v.fiat})`} value={`${v.totalValue.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} ${v.fiat}`} />
        ))}
        {avgTicket != null && (
          <StatCard label="Ticket médio" value={`${avgTicket.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} ${customer.volumeByFiat[0].fiat}`} />
        )}
      </div>

      <SectionCard title="Histórico de ordens com esta contraparte">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4">Tipo</th>
                <th className="pb-2 pr-4">Quantidade</th>
                <th className="pb-2 pr-4">Preço</th>
                <th className="pb-2 pr-4">Total</th>
                <th className="pb-2 pr-4">Estado</th>
                <th className="pb-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {customer.orders.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="py-2 pr-4">{o.side === 'buy' ? 'Compra' : 'Venda'}</td>
                  <td className="py-2 pr-4">
                    {o.quantity} {o.asset}
                  </td>
                  <td className="py-2 pr-4 font-mono">
                    {o.price} {o.fiat}
                  </td>
                  <td className="py-2 pr-4 font-mono">
                    {o.total_value} {o.fiat}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="py-2 text-muted">{new Date(o.created_at).toLocaleString('pt-PT')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 md:hidden">
          {customer.orders.map((o) => (
            <div key={o.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {o.side === 'buy' ? 'Compra' : 'Venda'} · {o.quantity} {o.asset}
                </span>
                <StatusBadge status={o.status} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div>
                  <span className="text-muted">Preço: </span>
                  <span className="font-mono">
                    {o.price} {o.fiat}
                  </span>
                </div>
                <div>
                  <span className="text-muted">Total: </span>
                  <span className="font-mono">
                    {o.total_value} {o.fiat}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted">Data: </span>
                  {new Date(o.created_at).toLocaleDateString('pt-PT')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
