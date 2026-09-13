import Link from 'next/link';
import { Users, Repeat } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getCustomerSummaries } from '@/lib/customers';
import { StatCard } from '@/components/StatCard';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';

function fmtVolume(volumeByFiat: Array<{ fiat: string; totalValue: number }>) {
  if (volumeByFiat.length === 0) return '—';
  return volumeByFiat.map((v) => `${v.totalValue.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} ${v.fiat}`).join(' · ');
}

export default async function CustomersPage() {
  const { user } = await requireUser();
  const customers = await getCustomerSummaries(user.id);
  const recurring = customers.filter((c) => c.orderCount >= 2);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Contrapartes</h1>
        <p className="mt-1 text-sm text-muted">As contrapartes com quem já negociaste, a partir do teu histórico sincronizado da Binance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard icon={Users} label="Contrapartes" value={String(customers.length)} />
        <StatCard icon={Repeat} label="Contrapartes recorrentes" value={String(recurring.length)} sub="2 ou mais ordens concluídas" />
      </div>

      <SectionCard title="Todas as contrapartes" icon={Users} subtitle={customers.length > 0 ? `${customers.length} contrapartes` : undefined}>
        {customers.length === 0 ? (
          <EmptyState
            title="Ainda sem contrapartes"
            description="Sincroniza no Início para importares o teu histórico real da Binance - cada ordem regista automaticamente a contraparte."
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4">Nickname</th>
                    <th className="pb-2 pr-4">Ordens</th>
                    <th className="pb-2 pr-4">Volume</th>
                    <th className="pb-2 pr-4">Primeira negociação</th>
                    <th className="pb-2">Última negociação</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="py-2 pr-4">
                        <Link href={`/customers/${c.id}`} className="font-medium text-accent hover:underline">
                          {c.nickname}
                        </Link>
                        {c.orderCount >= 2 && <span className="ml-2 rounded-full bg-positive/10 px-1.5 py-0.5 text-[10px] text-positive">recorrente</span>}
                      </td>
                      <td className="py-2 pr-4">
                        {c.orderCount} <span className="text-xs text-muted">({c.buyCount} compra · {c.sellCount} venda)</span>
                      </td>
                      <td className="py-2 pr-4 font-mono">{fmtVolume(c.volumeByFiat)}</td>
                      <td className="py-2 pr-4 text-muted">{new Date(c.firstSeenAt).toLocaleDateString('pt-PT')}</td>
                      <td className="py-2 text-muted">{new Date(c.lastSeenAt).toLocaleDateString('pt-PT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2 md:hidden">
              {customers.map((c) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="block rounded-lg border border-border p-3 text-xs hover:border-accent">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-accent">{c.nickname}</span>
                    {c.orderCount >= 2 && <span className="rounded-full bg-positive/10 px-1.5 py-0.5 text-[10px] text-positive">recorrente</span>}
                  </div>
                  <div className="mt-1 text-muted">
                    {c.orderCount} ordens ({c.buyCount} compra · {c.sellCount} venda) · {fmtVolume(c.volumeByFiat)}
                  </div>
                  <div className="mt-1 text-muted">Última negociação: {new Date(c.lastSeenAt).toLocaleDateString('pt-PT')}</div>
                </Link>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
