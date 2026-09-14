import { Bell, BellRing, Wallet, AlertOctagon, Target } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMarketSeries, getUserNotifications } from '@/lib/db';
import { getUserAlerts } from '@/lib/alerts';
import { formatAge } from '@/lib/dataQuality';
import { SectionCard } from '@/components/ui/SectionCard';
import { AlertsPanel } from '@/components/AlertsPanel';

const SYSTEM_NOTIFICATION_META: Record<string, { priority: 'critical' | 'warning' | 'info'; label: string; action: string }> = {
  sync_failed: { priority: 'critical', label: 'Sistema', action: 'Verifica a chave da Binance em Configurações e tenta sincronizar novamente.' },
  sync_stale: { priority: 'warning', label: 'Sistema', action: 'Carrega em "Sincronizar agora" no Início.' },
  order_status: { priority: 'info', label: 'Ordens', action: 'Ver o detalhe desta ordem em Ordens.' },
};

const PRIORITY_DOT: Record<'critical' | 'warning' | 'info', string> = {
  critical: 'bg-negative',
  warning: 'bg-accent',
  info: 'bg-info',
};

export default async function AlertsPage() {
  const { user } = await requireUser();

  const [alerts, marketSeries, notifications] = await Promise.all([
    getUserAlerts(user.id),
    getMarketSeries(),
    getUserNotifications(user.id, 50),
  ]);

  const marketPairs = marketSeries.map((s) => ({ asset: s.asset, fiat: s.fiat, buyPrice: s.lastBuy, sellPrice: s.lastSell }));
  const systemAndOrderNotifications = notifications.filter((n) => n.type in SYSTEM_NOTIFICATION_META);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Bell size={18} />
        </span>
        <div>
          <h1 className="text-xl font-bold">Centro de Alertas</h1>
          <p className="mt-1 text-sm text-muted">
            Condições de mercado e de conta que tu configuras, mais os avisos automáticos de sistema e ordens que este sistema já
            deteta sozinho.
          </p>
        </div>
      </div>

      <SectionCard
        title="Mercado"
        icon={BellRing}
        subtitle="Preço, spread, liquidez e o ciclo de arbitragem MZN⇄ZAR - avaliados a cada corrida da sincronização de mercado."
      >
        {marketPairs.length === 0 ? (
          <p className="text-sm text-muted">Ainda sem dados de mercado suficientes para criar alertas.</p>
        ) : (
          <AlertsPanel alerts={alerts} pairs={marketPairs} kinds={['price', 'cycle', 'spread', 'liquidity']} />
        )}
      </SectionCard>

      <SectionCard title="Conta" icon={Wallet} subtitle="Saldo total real da conta (Spot+Funding+Earn), lido a cada corrida da sincronização de mercado.">
        <AlertsPanel alerts={alerts} pairs={marketPairs} kinds={['account_balance', 'account_change_pct']} />
      </SectionCard>

      <SectionCard
        title="Oportunidades sem taxas"
        icon={Target}
        subtitle="Testa o teu orçamento configurado (ou só os teus favoritos) contra anúncios reais sem M-Pesa/e-Mola - avisa quando encontrar um lucro líquido real acima do que indicares."
      >
        <AlertsPanel alerts={alerts} pairs={marketPairs} kinds={['multi_ad_opportunity']} />
      </SectionCard>

      <SectionCard
        title="Sistema & Ordens"
        icon={AlertOctagon}
        subtitle="Avisos automáticos - sem configuração, disparados diretamente quando algo acontece de verdade."
      >
        {systemAndOrderNotifications.length === 0 ? (
          <p className="text-sm text-muted">Sem avisos de sistema ou de ordens até agora.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {systemAndOrderNotifications.map((n) => {
              const meta = SYSTEM_NOTIFICATION_META[n.type];
              return (
                <div key={n.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[meta.priority]}`} />
                      <span className="font-medium">{n.title}</span>
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted">{meta.label}</span>
                    </span>
                    <span className="text-xs text-muted">{formatAge(n.created_at)}</span>
                  </div>
                  {n.body && <p className="mt-1 text-xs text-muted">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-accent">Ação recomendada: {meta.action}</p>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
