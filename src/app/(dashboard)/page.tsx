import Link from 'next/link';
import { ShoppingCart, DollarSign, Scale, Clock, AlertTriangle, Calculator, ListChecks, Wallet, Megaphone, BarChart3 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getDashboardSummary, getMarketSeries } from '@/lib/db';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { SyncButton } from '@/components/SyncButton';
import { MarketChart } from '@/components/MarketChart';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

function fmtMoney(n: number, currency: string) {
  return `${n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export default async function DashboardPage() {
  const { user, profile } = await requireUser();
  const summary = await getDashboardSummary(user.id);
  const marketSeries = await getMarketSeries();
  const hasAnyOrder = summary.completedCount > 0 || summary.pendingCount > 0;
  const fiat = profile?.reference_currency ?? 'MZN';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Bem-vindo, {profile?.full_name ?? 'trader'}</h1>
          <p className="mt-1 text-sm text-muted">Aqui acompanhas todas as tuas operações P2P num único lugar.</p>
        </div>
        <SyncButton />
      </div>

      {summary.lastSync?.last_error && <ErrorBanner title="Última sincronização falhou" message={summary.lastSync.last_error} />}

      {!hasAnyOrder && (
        <EmptyState
          icon={ListChecks}
          title="Ainda sem operações para mostrar"
          description='Carrega em "Sincronizar agora" para importar o teu histórico real da Binance.'
        />
      )}

      {marketSeries.length > 0 && (
        <div className="flex flex-col gap-4">
          {marketSeries.map((series) => (
            <MarketChart key={`${series.asset}-${series.fiat}`} series={series} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ShoppingCart}
          label="Total comprado"
          value={fmtMoney(summary.totalBuy, fiat)}
          sub={`${summary.completedCount} operações concluídas`}
        />
        <StatCard icon={DollarSign} label="Total vendido" value={fmtMoney(summary.totalSell, fiat)} />
        <StatCard
          icon={Scale}
          label="Lucro bruto"
          value={fmtMoney(summary.grossProfit, fiat)}
          tone={summary.grossProfit >= 0 ? 'positive' : 'negative'}
          sub="Vendas − compras, sem taxas ainda deduzidas"
        />
        <StatCard
          icon={Clock}
          label="Ordens pendentes"
          value={String(summary.pendingCount)}
          tone={summary.pendingCount > 0 ? undefined : 'positive'}
          sub={summary.pendingCount > 0 ? 'Precisam da tua atenção' : 'Tudo em dia'}
        />
      </div>

      {summary.attentionOrders.length > 0 && (
        <SectionCard title="Atenção necessária" icon={AlertTriangle} className="border-accent/40 bg-accent/5">
          <ul className="flex flex-col gap-2">
            {summary.attentionOrders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {o.side === 'buy' ? 'Compra' : 'Venda'} de {o.quantity} {o.asset} · {o.external_order_id}
                </span>
                <StatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title="Últimas ordens"
        icon={ListChecks}
        action={
          <Link href="/orders" className="text-xs text-accent hover:underline">
            Ver todas as ordens →
          </Link>
        }
      >
        {summary.recentOrders.length === 0 ? (
          <EmptyState title="Sem ordens ainda" description="Sincroniza para importares o teu histórico real da Binance." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4">Tipo</th>
                    <th className="pb-2 pr-4">Ativo</th>
                    <th className="pb-2 pr-4">Preço</th>
                    <th className="pb-2 pr-4">Total</th>
                    <th className="pb-2 pr-4">Estado</th>
                    <th className="pb-2">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentOrders.map((o) => (
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
                      <td className="py-2 text-muted">{new Date(o.created_at).toLocaleDateString('pt-PT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 md:hidden">
              {summary.recentOrders.map((o) => (
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
          </>
        )}
      </SectionCard>

      <SectionCard title="Ações rápidas" muted>
        <div className="flex flex-wrap gap-2">
          <QuickAction href="/simulation" label="Simular lucro" icon={Calculator} />
          <QuickAction href="/orders" label="Ver ordens" icon={ListChecks} />
          <QuickAction href="/wallet" label="Ver carteira" icon={Wallet} />
          <QuickAction href="/ads" label="Ver anúncios" icon={Megaphone} />
          <QuickAction href="/analytics" label="Ver análise" icon={BarChart3} />
        </div>
      </SectionCard>
    </div>
  );
}

function QuickAction({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Calculator }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
    >
      <Icon size={14} />
      {label}
    </Link>
  );
}
