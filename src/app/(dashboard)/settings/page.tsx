import { UserCircle, Link2, BellRing } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { query, getMarketSeries } from '@/lib/db';
import { getUserAlerts } from '@/lib/alerts';
import { SectionCard } from '@/components/ui/SectionCard';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { AlertsPanel } from '@/components/AlertsPanel';

export default async function SettingsPage() {
  const { user, profile } = await requireUser();

  const [syncRow] = await query<{ last_synced_at: string | null; last_error: string | null }>(
    `select last_synced_at, last_error from p2p_manager.sync_state where user_id = $1 and platform = 'binance' and resource = 'orders'`,
    [user.id]
  );

  const [alerts, marketSeries] = await Promise.all([getUserAlerts(user.id), getMarketSeries()]);
  const marketPairs = marketSeries.map((s) => ({ asset: s.asset, fiat: s.fiat, buyPrice: s.lastBuy, sellPrice: s.lastSell }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Configurações</h1>
        <p className="mt-1 text-sm text-muted">Conta, ligação com a Binance e alertas.</p>
      </div>

      <SectionCard title="Conta" icon={UserCircle}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
          <dt className="text-muted">Nome</dt>
          <dd>{profile?.full_name ?? '—'}</dd>
          <dt className="text-muted">Email</dt>
          <dd className="truncate">{user.email}</dd>
          <dt className="text-muted">Perfil</dt>
          <dd className="capitalize">{profile?.role ?? 'trader'}</dd>
          <dt className="text-muted">Moeda de referência</dt>
          <dd>{profile?.reference_currency ?? 'MZN'}</dd>
        </dl>
      </SectionCard>

      <SectionCard title="Sincronização com a Binance" icon={Link2}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
          <dt className="text-muted">Última sincronização</dt>
          <dd>{syncRow?.last_synced_at ? new Date(syncRow.last_synced_at).toLocaleString('pt-PT') : 'Nunca'}</dd>
          <dt className="text-muted">Estado</dt>
          <dd className={syncRow?.last_error ? 'text-negative' : 'text-positive'}>{syncRow?.last_error ? 'Erro' : 'OK'}</dd>
        </dl>
        {syncRow?.last_error && (
          <div className="mt-3">
            <ErrorBanner message={syncRow.last_error} />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Alertas personalizados"
        icon={BellRing}
        subtitle="Avaliados a cada corrida da sincronização de mercado, com base nos preços P2P reais. Avisa quando o preço de um par passar de um valor, ou quando surgir uma janela real de arbitragem no ciclo MZN⇄ZAR."
      >
        {marketPairs.length === 0 ? (
          <p className="text-sm text-muted">Ainda sem dados de mercado suficientes para criar alertas.</p>
        ) : (
          <AlertsPanel alerts={alerts} pairs={marketPairs} />
        )}
      </SectionCard>
    </div>
  );
}
