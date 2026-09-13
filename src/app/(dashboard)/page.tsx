import Link from 'next/link';
import {
  AlertTriangle,
  Bell,
  Calculator,
  ListChecks,
  Wallet,
  Landmark,
  Megaphone,
  BarChart3,
  ShoppingCart,
  ArrowRightLeft,
  Target,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getDashboardSummary, getMarketFreshness, getMarketSeries, getRecentActivity, type ActivityItem } from '@/lib/db';
import { getRealWalletSnapshot, getAssetDistribution, type WalletBalance } from '@/lib/wallet';
import { getMidRates } from '@/lib/exchangeRates';
import { getOpportunities } from '@/lib/opportunities';
import { formatAge } from '@/lib/dataQuality';
import { StatusBadge } from '@/components/StatusBadge';
import { SyncButton } from '@/components/SyncButton';
import { MarketChart } from '@/components/MarketChart';
import { SyncStatusBar } from '@/components/SyncStatusBar';
import { DataTag } from '@/components/DataTag';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

// Orders sync is manually/periodically triggered; market data ticks every
// cron run (minutes); a wallet read is live on every page load - each gets
// thresholds matching its own natural cadence.
const ORDERS_SYNC_THRESHOLDS = { delayedAfterMs: 2 * 3600_000, staleAfterMs: 24 * 3600_000 };
const MARKET_THRESHOLDS = { delayedAfterMs: 5 * 60_000, staleAfterMs: 30 * 60_000 };

const MOVEMENT_LABEL: Record<string, string> = { deposit: 'Depósito', withdrawal: 'Levantamento', adjustment: 'Ajuste' };

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

/** Only stable assets carry a real USD-equivalent (see STABLE_ASSETS in
 *  lib/wallet.ts, pegged ~1:1) - for those, free/locked quantities already
 *  are the USD-equivalent split, no conversion needed. Everything else has
 *  no real price this app can convert, so it's excluded rather than guessed. */
function sumFreeLocked(balances: WalletBalance[]) {
  let free = 0;
  let locked = 0;
  for (const b of balances) {
    if (b.usdEquivalent == null) continue;
    free += b.free;
    locked += b.locked;
  }
  return { free, locked };
}

function ActivityRow({ item }: { item: ActivityItem }) {
  if (item.kind === 'order') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2">
          <ShoppingCart size={14} className="shrink-0 text-muted" />
          {item.side === 'buy' ? 'Compra' : 'Venda'} de {item.quantity} {item.asset}
          <StatusBadge status={item.status} />
        </span>
        <span className="text-xs text-muted">{formatAge(item.t)}</span>
      </div>
    );
  }
  if (item.kind === 'movement') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2">
          <ArrowRightLeft size={14} className="shrink-0 text-muted" />
          {MOVEMENT_LABEL[item.type] ?? item.type} de {item.amount} {item.asset}
          <span className="text-[11px] text-muted">(registo pessoal)</span>
        </span>
        <span className="text-xs text-muted">{formatAge(item.t)}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2">
        <Bell size={14} className="shrink-0 text-muted" />
        {item.title}
      </span>
      <span className="text-xs text-muted">{formatAge(item.t)}</span>
    </div>
  );
}

export default async function DashboardPage() {
  const { user, profile } = await requireUser();

  const [summary, marketSeries, marketFreshness, recentActivity, opportunitiesResult] = await Promise.all([
    getDashboardSummary(user.id),
    getMarketSeries(),
    getMarketFreshness(),
    getRecentActivity(user.id, 15),
    getOpportunities(),
  ]);

  const { mznRate, zarRate } = getMidRates(marketSeries);
  let walletSnapshot: Awaited<ReturnType<typeof getRealWalletSnapshot>> | null = null;
  let walletFetchError: string | null = null;
  try {
    walletSnapshot = await getRealWalletSnapshot(mznRate, zarRate);
  } catch (err) {
    walletFetchError = err instanceof Error ? err.message : 'Falha ao ler o saldo da Binance.';
  }
  const assetDistribution = walletSnapshot ? getAssetDistribution(walletSnapshot).slice(0, 5) : [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Bem-vindo, {profile?.full_name ?? 'trader'}</h1>
          <p className="mt-1 text-sm text-muted">Como está a tua conta neste momento.</p>
        </div>
        <SyncButton />
      </div>

      <SyncStatusBar
        items={[
          {
            label: 'Sincronização de ordens',
            timestamp: summary.lastSync?.last_synced_at ?? null,
            error: summary.lastSync?.last_error ?? null,
            thresholds: ORDERS_SYNC_THRESHOLDS,
          },
          {
            label: 'Dados de mercado P2P',
            timestamp: marketFreshness.lastCheckedAt,
            thresholds: MARKET_THRESHOLDS,
          },
          {
            label: 'Conta Binance (saldo)',
            timestamp: walletSnapshot?.fetchedAt ?? null,
            error: walletFetchError,
          },
        ]}
      />

      {summary.lastSync?.last_error && <ErrorBanner title="Última sincronização de ordens falhou" message={summary.lastSync.last_error} />}
      {walletFetchError && (
        <ErrorBanner
          title="Não consegui ler o saldo real da Binance"
          message={`${walletFetchError} O resto da página continua a funcionar com o que já temos.`}
        />
      )}

      {walletSnapshot && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-accent">Portfolio total</span>
            <DataTag source="binance_private" fetchedAt={walletSnapshot.fetchedAt} label="Binance (conta)" />
          </div>
          <div className="mt-1 flex flex-wrap items-end gap-x-6 gap-y-1">
            <span className="font-mono text-3xl font-bold">{fmt(walletSnapshot.totalUsd, 4)} USD</span>
            {walletSnapshot.totalMzn != null && <span className="font-mono text-base text-muted">≈ {fmt(walletSnapshot.totalMzn)} MZN</span>}
            {walletSnapshot.totalZar != null && <span className="font-mono text-base text-muted">≈ {fmt(walletSnapshot.totalZar)} ZAR</span>}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {walletSnapshot.groups.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs">
                <span className="text-muted">{g.label}</span>
                <span className="font-mono font-semibold">{fmt(g.totalUsd, 4)} USD</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs">
              <span className="text-muted">Earn</span>
              <span className="font-mono font-semibold">{fmt(walletSnapshot.earnTotalUsd, 4)} USD</span>
            </div>
          </div>

          {assetDistribution.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Distribuição por ativo</div>
              <div className="flex flex-wrap gap-2">
                {assetDistribution.map((a) => (
                  <span key={a.asset} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs">
                    {a.asset} <span className="font-mono text-muted">{fmt(a.usdEquivalent, 2)} USD</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {walletSnapshot && (
        <SectionCard title="Capital disponível" icon={Landmark} action={<DataTag source="binance_private" fetchedAt={walletSnapshot.fetchedAt} />}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {walletSnapshot.groups.map((g) => {
              const { free, locked } = sumFreeLocked(g.balances);
              return (
                <div key={g.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="text-xs uppercase tracking-wide text-muted">{g.label}</div>
                  <div className="mt-1.5 flex justify-between text-xs">
                    <span className="text-muted">Disponível</span>
                    <span className="font-mono text-positive">{fmt(free, 4)} USD</span>
                  </div>
                  <div className="mt-0.5 flex justify-between text-xs">
                    <span className="text-muted">Bloqueado</span>
                    <span className="font-mono">{fmt(locked, 4)} USD</span>
                  </div>
                </div>
              );
            })}
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted">Earn</div>
              <div className="mt-1.5 flex justify-between text-xs">
                <span className="text-muted">Principal</span>
                <span className="font-mono">{fmt(walletSnapshot.earnTotalUsd, 4)} USD</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted">rendendo juros, não é liquidez imediata</div>
            </div>
          </div>

          {summary.committedValueByFiat.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              Comprometido em ordens abertas:
              {summary.committedValueByFiat.map((c) => (
                <span key={c.fiat} className="font-mono text-foreground">
                  {fmt(c.total)} {c.fiat}
                </span>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {marketSeries.length > 0 && (
        <div className="flex flex-col gap-4">
          {marketSeries.map((series) => (
            <MarketChart key={`${series.asset}-${series.fiat}`} series={series} />
          ))}
        </div>
      )}

      <Link
        href="/opportunities"
        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent"
      >
        <span className="flex items-center gap-2 text-sm">
          <Target size={16} className="text-accent" />
          {opportunitiesResult.opportunities.length > 0
            ? `${opportunitiesResult.opportunities.length} oportunidade(s) observada(s) agora`
            : 'Nenhuma oportunidade observada agora'}
        </span>
        <span className="text-xs text-accent">Opportunity Center →</span>
      </Link>

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
        title="Atividade recente"
        icon={ListChecks}
        subtitle="Ordens sincronizadas, o teu registo pessoal de transferências, e alertas - as fontes que este sistema realmente acompanha hoje."
        action={
          <Link href="/orders" className="text-xs text-accent hover:underline">
            Ver todas as ordens →
          </Link>
        }
      >
        {recentActivity.length === 0 ? (
          <EmptyState title="Ainda sem atividade" description='Carrega em "Sincronizar agora" para importar o teu histórico real da Binance.' />
        ) : (
          <div className="flex flex-col gap-2.5">
            {recentActivity.map((item) => (
              <ActivityRow key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Ações rápidas" muted>
        <div className="flex flex-wrap gap-2">
          <QuickAction href="/simulation" label="Simular lucro" icon={Calculator} />
          <QuickAction href="/orders" label="Ver ordens" icon={ListChecks} />
          <QuickAction href="/wallet" label="Ver carteira" icon={Wallet} />
          <QuickAction href="/ads" label="Ver anúncios" icon={Megaphone} />
          <QuickAction href="/analytics" label="Ver análise" icon={BarChart3} />
          <QuickAction href="/opportunities" label="Ver oportunidades" icon={Target} />
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
