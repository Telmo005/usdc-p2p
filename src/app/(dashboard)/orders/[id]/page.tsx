import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ListChecks, User } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getOrderDetail } from '@/lib/db';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTag } from '@/components/DataTag';
import { SectionCard } from '@/components/ui/SectionCard';

function fmt(n: number | string, maxFrac = 2) {
  return Number(n).toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-PT');
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  const order = await getOrderDetail(user.id, id);
  if (!order) notFound();

  const stillOpen = !['completed', 'cancelled', 'expired'].includes(order.status);
  const endTimestamp = order.completed_at ?? order.cancelled_at;
  const endLabel = order.completed_at ? 'Concluída' : order.cancelled_at ? 'Cancelada' : null;

  // Reuses the exact same query-param contract Anúncios already built
  // (Phase 4) - ProfitCalculator's prefill needs zero changes for this.
  const simulateHref = `/simulation?asset=${order.asset}&fiat=${order.fiat}&side=${order.side}&price=${order.price}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/orders" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent">
          <ArrowLeft size={12} /> Ordens
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
            <ListChecks size={18} />
          </span>
          <div>
            <h1 className="text-xl font-bold">
              {order.side === 'buy' ? 'Compra' : 'Venda'} de {fmt(order.quantity, 8)} {order.asset}
            </h1>
            <p className="font-mono text-xs text-muted">{order.external_order_id}</p>
          </div>
        </div>
      </div>

      <SectionCard title="Detalhes">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-3">
          <dt className="text-muted">Estado</dt>
          <dd className="col-span-1 sm:col-span-2">
            <StatusBadge status={order.status} />
          </dd>
          <dt className="text-muted">Preço</dt>
          <dd className="font-mono">
            {fmt(order.price, 4)} {order.fiat}
          </dd>
          <dt className="text-muted">Total</dt>
          <dd className="font-mono">
            {fmt(order.total_value)} {order.fiat}
          </dd>
          <dt className="text-muted">Taxa</dt>
          <dd className="font-mono">
            {fmt(order.fee)} {order.fiat}
          </dd>
          <dt className="text-muted">Método de pagamento</dt>
          <dd>{order.payment_method ?? '—'}</dd>
          <dt className="text-muted">Contraparte</dt>
          <dd>
            {order.counterparty_id ? (
              <Link href={`/customers/${order.counterparty_id}`} className="text-accent hover:underline">
                {order.counterparty_nickname}
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </dl>
      </SectionCard>

      <SectionCard title="Timeline" subtitle="Só os pontos que a Binance realmente nos dá - nada inventado entre eles.">
        <ol className="flex flex-col gap-4">
          <li className="flex items-start gap-3">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-positive" />
            <div>
              <div className="text-sm font-medium">Criada</div>
              <div className="text-xs text-muted">{fmtDateTime(order.created_at)}</div>
            </div>
          </li>

          <li className="flex items-start gap-3">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${stillOpen ? 'bg-accent' : 'bg-muted'}`} />
            <div>
              <div className="text-sm font-medium">Estado atual</div>
              <div className="mt-0.5">
                <StatusBadge status={order.status} />
              </div>
            </div>
          </li>

          <li className="flex items-start gap-3">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${endTimestamp ? 'bg-positive' : 'bg-border'}`} />
            <div>
              <div className="text-sm font-medium">{endLabel ?? 'Ainda não concluída'}</div>
              {endTimestamp && (
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">{fmtDateTime(endTimestamp)}</span>
                  <DataTag
                    source="calculated"
                    label="aproximado"
                  />
                </div>
              )}
              {endTimestamp && (
                <p className="mt-1 text-[11px] text-muted">
                  A Binance não fornece a hora real de conclusão/cancelamento - esta é a hora em que este sistema detetou a
                  mudança de estado, não a hora real.
                </p>
              )}
            </div>
          </li>
        </ol>
      </SectionCard>

      <SectionCard title="Contraparte" icon={User} muted>
        {order.counterparty_id ? (
          <Link href={`/customers/${order.counterparty_id}`} className="text-sm text-accent hover:underline">
            Ver histórico com {order.counterparty_nickname} →
          </Link>
        ) : (
          <p className="text-sm text-muted">Sem contraparte identificada para esta ordem.</p>
        )}
      </SectionCard>

      <SectionCard title="Reproduzir cenário" muted subtitle="Abre o simulador com o preço real desta ordem já preenchido.">
        <Link
          href={simulateHref}
          className="inline-flex items-center rounded-lg border border-accent/50 px-3 py-1.5 text-sm text-accent hover:bg-accent/10"
        >
          Simular a este preço →
        </Link>
      </SectionCard>
    </div>
  );
}
