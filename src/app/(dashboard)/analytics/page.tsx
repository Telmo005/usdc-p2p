import Link from 'next/link';
import { BarChart3, Download, Users } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getAnalytics, type PeriodDays } from '@/lib/analytics';
import { getCustomerSummaries } from '@/lib/customers';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { AnalyticsFiatView } from '@/components/AnalyticsFiatView';

const PERIODS: Array<{ label: string; value: string; days: PeriodDays }> = [
  { label: '7 dias', value: '7', days: 7 },
  { label: '30 dias', value: '30', days: 30 },
  { label: '90 dias', value: '90', days: 90 },
  { label: 'Tudo', value: 'all', days: null },
];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { user } = await requireUser();
  const { period } = await searchParams;
  const selected = PERIODS.find((p) => p.value === period) ?? PERIODS[3];

  const [data, customers] = await Promise.all([getAnalytics(user.id, selected.days), getCustomerSummaries(user.id)]);

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

      <SectionCard title="Desempenho" icon={BarChart3} subtitle={`Período: ${selected.label.toLowerCase()}`}>
        {!hasAnyData ? (
          <EmptyState
            title="Sem operações concluídas neste período"
            description="Sincroniza no Início para importares o teu histórico, ou experimenta um período maior."
          />
        ) : (
          <AnalyticsFiatView data={data} />
        )}
      </SectionCard>

      <SectionCard title="Top clientes" icon={Users} subtitle="Por volume total negociado, todo o histórico">
        {topCustomers.length === 0 ? (
          <EmptyState title="Ainda sem clientes" description="Aparecem aqui assim que tiveres ordens concluídas com contrapartes identificadas." />
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
    </div>
  );
}
