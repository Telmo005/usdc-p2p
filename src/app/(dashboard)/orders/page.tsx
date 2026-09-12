import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { StatusBadge } from '@/components/StatusBadge';

const STATUSES = ['all', 'pending', 'awaiting_payment', 'payment_received', 'awaiting_confirmation', 'completed', 'cancelled', 'expired', 'disputed'] as const;

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
            {s === 'all' ? 'Todas' : s}
          </a>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma ordem encontrada para este filtro. Sincroniza no Início para importar o teu histórico.</p>
        ) : (
          <div className="overflow-x-auto">
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
                  <tr key={o.id} className="border-t border-border">
                    <td className="py-2 pr-4 font-mono text-xs text-muted">{o.external_order_id}</td>
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
                    <td className="py-2 pr-4">{o.payment_method ?? '-'}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="py-2 text-muted">{new Date(o.created_at).toLocaleString('pt-PT')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
