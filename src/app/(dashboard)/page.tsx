import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getDashboardSummary, getMarketSeries } from '@/lib/db';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { SyncButton } from '@/components/SyncButton';
import { MarketChart } from '@/components/MarketChart';

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

      {summary.lastSync?.last_error && (
        <div className="rounded-xl border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-negative">
          Última sincronização falhou: {summary.lastSync.last_error}
        </div>
      )}

      {!hasAnyOrder && (
        <div className="rounded-xl border border-border bg-surface px-5 py-4 text-sm text-muted">
          Ainda não existem operações para apresentar. Carrega em <span className="text-foreground">Sincronizar agora</span> para
          importar o teu histórico real da Binance.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {marketSeries.map((series) => (
          <MarketChart key={`${series.asset}-${series.fiat}`} series={series} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total comprado" value={fmtMoney(summary.totalBuy, fiat)} sub={`${summary.completedCount} operações concluídas`} />
        <StatCard label="Total vendido" value={fmtMoney(summary.totalSell, fiat)} />
        <StatCard
          label="Lucro bruto"
          value={fmtMoney(summary.grossProfit, fiat)}
          tone={summary.grossProfit >= 0 ? 'positive' : 'negative'}
          sub="Vendas − compras, sem taxas ainda deduzidas"
        />
        <StatCard label="Ordens pendentes" value={String(summary.pendingCount)} sub={summary.pendingCount > 0 ? 'Precisam da tua atenção' : 'Tudo em dia'} />
      </div>

      {summary.attentionOrders.length > 0 && (
        <section className="rounded-xl border border-accent/40 bg-accent/5 p-5">
          <h2 className="text-sm font-semibold text-accent">⚠️ Atenção necessária</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {summary.attentionOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between text-sm">
                <span>
                  {o.side === 'buy' ? 'Compra' : 'Venda'} de {o.quantity} {o.asset} · {o.external_order_id}
                </span>
                <StatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Últimas ordens</h2>
          <Link href="/orders" className="text-xs text-accent hover:underline">
            Ver todas as ordens →
          </Link>
        </div>

        {summary.recentOrders.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Sem ordens ainda.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
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
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Ações rápidas</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <QuickAction href="/ads" label="Criar anúncio" />
          <QuickAction href="/orders" label="Ver ordens" />
          <QuickAction href="/ads" label="Ver anúncios" />
          <QuickAction href="/analytics" label="Analisar mercado" />
          <QuickAction href="/wallet" label="Ver carteira" />
          <QuickAction href="/analytics" label="Gerar relatório" />
        </div>
      </section>
    </div>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-accent">
      {label}
    </Link>
  );
}
