import Link from 'next/link';
import { BarChart3, Download, Users, LineChart, Scale } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getAnalytics, type PeriodDays } from '@/lib/analytics';
import { getCustomerSummaries } from '@/lib/customers';
import { getMarketSeries, getAccountSnapshots } from '@/lib/db';
import { getMarketAnalysis } from '@/lib/marketAnalysis';
import { getMidRates } from '@/lib/exchangeRates';
import { getRealWalletSnapshot, getAssetDistribution, getMovementSummary } from '@/lib/wallet';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { AnalyticsFiatView } from '@/components/AnalyticsFiatView';
import { MarketAnalysisPanel } from '@/components/MarketAnalysisPanel';
import { AccountValueChart } from '@/components/AccountValueChart';
import { DataTag } from '@/components/DataTag';

const PERIODS: Array<{ label: string; value: string; days: PeriodDays }> = [
  { label: '7 dias', value: '7', days: 7 },
  { label: '30 dias', value: '30', days: 30 },
  { label: '90 dias', value: '90', days: 90 },
  { label: 'Tudo', value: 'all', days: null },
];

const MOVEMENT_TYPE_LABEL: Record<string, string> = { deposit: 'Depósito', withdrawal: 'Levantamento', adjustment: 'Ajuste' };

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { user } = await requireUser();
  const { period } = await searchParams;
  const selected = PERIODS.find((p) => p.value === period) ?? PERIODS[3];
  const effectiveDays = selected.days ?? 3650; // "Tudo" - market/account history never actually spans 10 years, just means "no lower bound"

  const [data, customers, marketSeries, marketAnalysis, accountSnapshots, movementSummary] = await Promise.all([
    getAnalytics(user.id, selected.days),
    getCustomerSummaries(user.id),
    getMarketSeries(),
    getMarketAnalysis(effectiveDays),
    getAccountSnapshots(effectiveDays),
    getMovementSummary(user.id, selected.days),
  ]);

  const { mznRate, zarRate } = getMidRates(marketSeries);
  let walletSnapshot: Awaited<ReturnType<typeof getRealWalletSnapshot>> | null = null;
  let walletFetchError: string | null = null;
  try {
    walletSnapshot = await getRealWalletSnapshot(mznRate, zarRate);
  } catch (err) {
    walletFetchError = err instanceof Error ? err.message : 'Falha ao ler o saldo da Binance.';
  }
  const assetDistribution = walletSnapshot ? getAssetDistribution(walletSnapshot) : [];
  const topAssetShare =
    walletSnapshot && walletSnapshot.totalUsd > 0 && assetDistribution.length > 0
      ? (assetDistribution[0].usdEquivalent / walletSnapshot.totalUsd) * 100
      : null;

  const topCustomers = customers
    .filter((c) => c.volumeByFiat.length > 0)
    .sort((a, b) => (b.volumeByFiat[0]?.totalValue ?? 0) - (a.volumeByFiat[0]?.totalValue ?? 0))
    .slice(0, 5);

  const hasAnyData = data.fiats.length > 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Análise & Relatórios</h1>
          <p className="mt-1 text-sm text-muted">Desempenho real das tuas ordens concluídas, sincronizadas da Binance.</p>
        </div>
        <a
          href={`/api/export/orders${selected.days ? `?days=${selected.days}` : ''}`}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-accent"
        >
          <Download size={13} /> Exportar CSV ({selected.label.toLowerCase()})
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={p.value === 'all' ? '/analytics' : `/analytics?period=${p.value}`}
            className={`rounded-full border px-3 py-1 text-xs ${
              selected.value === p.value ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <SectionCard
        title="Desempenho"
        icon={BarChart3}
        subtitle={`Período: ${selected.label.toLowerCase()}`}
        action={<DataTag source="historical" />}
      >
        {!hasAnyData ? (
          <EmptyState
            title="Sem operações concluídas neste período"
            description="Sincroniza no Início para importares o teu histórico, ou experimenta um período maior."
          />
        ) : (
          <AnalyticsFiatView data={data} />
        )}
      </SectionCard>

      <SectionCard title="Top contrapartes" icon={Users} subtitle="Por volume total negociado, todo o histórico">
        {topCustomers.length === 0 ? (
          <EmptyState title="Ainda sem contrapartes" description="Aparecem aqui assim que tiveres ordens concluídas com contrapartes identificadas." />
        ) : (
          <div className="flex flex-col gap-2">
            {topCustomers.map((c, i) => (
              <Link
                key={c.id}
                href={`/customers/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm hover:border-accent"
              >
                <span>
                  <span className="mr-2 text-xs text-muted">#{i + 1}</span>
                  <span className="font-medium text-accent">{c.nickname}</span>
                  <span className="ml-2 text-xs text-muted">
                    {c.orderCount} ordens ({c.buyCount} compra · {c.sellCount} venda)
                  </span>
                </span>
                <span className="font-mono text-xs">
                  {c.volumeByFiat.map((v) => `${v.totalValue.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} ${v.fiat}`).join(' · ')}
                </span>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Análise de mercado"
        icon={LineChart}
        subtitle={`Volatilidade, reversões de tendência e liquidez para os pares rastreados - período: ${selected.label.toLowerCase()}`}
      >
        <MarketAnalysisPanel pairs={marketAnalysis} />
      </SectionCard>

      <SectionCard title="Análise da conta" icon={Scale} subtitle="Composição real do portfolio e movimentos do teu registo pessoal">
        {walletFetchError && (
          <ErrorBanner
            title="Não consegui ler o saldo real da Binance"
            message={`${walletFetchError} As secções abaixo que dependem do saldo real ficam indisponíveis até conseguires atualizar.`}
          />
        )}

        {walletSnapshot && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <DataTag source="binance_private" fetchedAt={walletSnapshot.fetchedAt} label="Binance (conta)" />
            {topAssetShare != null && (
              <span className="text-xs text-muted">
                Concentração: <span className="font-mono text-foreground">{assetDistribution[0].asset}</span> representa{' '}
                <span className="font-mono text-foreground">{fmt(topAssetShare)}%</span> do portfolio
              </span>
            )}
          </div>
        )}

        {assetDistribution.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {assetDistribution.map((a) => (
              <span key={a.asset} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs">
                {a.asset} <span className="font-mono text-muted">{fmt(a.usdEquivalent, 2)} USD</span>
              </span>
            ))}
          </div>
        )}

        {movementSummary.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              Movimentação (registo pessoal) <DataTag source="manual" />
            </div>
            <div className="flex flex-col gap-1.5">
              {movementSummary.map((m) => (
                <div key={`${m.type}-${m.asset}`} className="flex items-center justify-between text-sm">
                  <span className="text-muted">
                    {MOVEMENT_TYPE_LABEL[m.type] ?? m.type} · {m.asset} <span className="text-xs">({m.count})</span>
                  </span>
                  <span className="font-mono">
                    {fmt(Math.abs(m.total), 4)} {m.asset}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <AccountValueChart points={accountSnapshots} />
        </div>
      </SectionCard>
    </div>
  );
}
