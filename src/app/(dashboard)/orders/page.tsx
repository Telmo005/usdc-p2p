import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { StatusBadge } from '@/components/StatusBadge';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ORDER_STATUS_CONFIG, ORDER_STATUSES } from '@/lib/orderStatus';

const STATUS_LABEL: Record<string, string> = { all: 'Todas' };
for (const [key, cfg] of Object.entries(ORDER_STATUS_CONFIG)) STATUS_LABEL[key] = cfg.label;
const STATUSES = ORDER_STATUSES;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { user } = await requireUser();
  const { status } = await searchParams;
  const filter = STATUSES.includes((status ?? 'all') as (typeof STATUSES)[number]) ? (status ?? 'all') : 'all';

  const rows = await query<{
    id: string;
    platform: string;
    external_order_id: string;
    side: string;
    asset: string;
    fiat: string;
    quantity: string;
    price: string;
    total_value: string;
    payment_method: string | null;
    status: string;
    created_at: string;
  }>(
    filter === 'all'
      ? `select id, platform, external_order_id, side, asset, fiat, quantity, price, total_value, payment_method, status, created_at
         from p2p_manager.orders where user_id = $1 order by created_at desc limit 200`
      : `select id, platform, external_order_id, side, asset, fiat, quantity, price, total_value, payment_method, status, created_at
         from p2p_manager.orders where user_id = $1 and status = $2 order by created_at desc limit 200`,
    filter === 'all' ? [user.id] : [user.id, filter]
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Ordens</h1>
        <p className="mt-1 text-sm text-muted">Todo o teu histórico de operações P2P, sincronizado da Binance.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <a
            key={s}
            href={s === 'all' ? '/orders' : `/orders?status=${s}`}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === s ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'
            }`}
          >
            {STATUS_LABEL[s]}
          </a>
        ))}
      </div>

      <SectionCard
        title={filter === 'all' ? 'Todas as ordens' : STATUS_LABEL[filter]}
        icon={ListChecks}
        subtitle={rows.length > 0 ? `${rows.length} ordem${rows.length === 1 ? '' : 's'}${rows.length === 200 ? ' (limite de 200 mostradas)' : ''}` : undefined}
      >
        {rows.length === 0 ? (
          <EmptyState
            title="Nenhuma ordem encontrada"
            description={filter === 'all' ? 'Sincroniza no Início para importares o teu histórico real da Binance.' : 'Não há ordens com este estado. Experimenta outro filtro.'}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4">ID</th>
                    <th className="pb-2 pr-4">Tipo</th>
                    <th className="pb-2 pr-4">Quantidade</th>
                    <th className="pb-2 pr-4">Preço</th>
                    <th className="pb-2 pr-4">Total</th>
                    <th className="pb-2 pr-4">Método</th>
                    <th className="pb-2 pr-4">Estado</th>
                    <th className="pb-2">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} className="cursor-pointer border-t border-border hover:bg-surface-raised">
                      <td className="py-2 pr-4 font-mono text-xs text-muted">
                        <Link href={`/orders/${o.id}`} className="block hover:text-accent">
                          {o.external_order_id}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <Link href={`/orders/${o.id}`} className="block">
                          {o.side === 'buy' ? 'Compra' : 'Venda'}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <Link href={`/orders/${o.id}`} className="block">
                          {o.quantity} {o.asset}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 font-mono">
                        <Link href={`/orders/${o.id}`} className="block">
                          {o.price} {o.fiat}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 font-mono">
                        <Link href={`/orders/${o.id}`} className="block">
                          {o.total_value} {o.fiat}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <Link href={`/orders/${o.id}`} className="block">
                          {o.payment_method ?? '-'}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <Link href={`/orders/${o.id}`} className="block">
                          <StatusBadge status={o.status} />
                        </Link>
                      </td>
                      <td className="py-2 text-muted">
                        <Link href={`/orders/${o.id}`} className="block">
                          {new Date(o.created_at).toLocaleString('pt-PT')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 md:hidden">
              {rows.map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`} className="block rounded-lg border border-border p-3 hover:border-accent">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {o.side === 'buy' ? 'Compra' : 'Venda'} · {o.quantity} {o.asset}
                    </span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted">{o.external_order_id}</div>
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
                    <div>
                      <span className="text-muted">Método: </span>
                      {o.payment_method ?? '-'}
                    </div>
                    <div>
                      <span className="text-muted">Data: </span>
                      {new Date(o.created_at).toLocaleDateString('pt-PT')}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
