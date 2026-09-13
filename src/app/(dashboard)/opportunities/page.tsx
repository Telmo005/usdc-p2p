import { Target } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getOpportunities } from '@/lib/opportunities';
import { OpportunityCard } from '@/components/OpportunityCard';
import { SectionCard } from '@/components/ui/SectionCard';

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

export default async function OpportunitiesPage() {
  await requireUser();
  const { opportunities, monitoredCyclePct, monitoredPairs } = await getOpportunities();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Target size={18} />
        </span>
        <div>
          <h1 className="text-xl font-bold">Opportunity Center</h1>
          <p className="mt-1 text-sm text-muted">
            Situações reais detetadas nos dados que este sistema já acompanha - nunca uma diferença de preço apresentada como
            lucro garantido. Cada oportunidade explica exatamente porque foi classificada.
          </p>
        </div>
      </div>

      {opportunities.length > 0 ? (
        <div className="flex flex-col gap-4">
          {opportunities.map((o) => (
            <OpportunityCard key={o.id} opportunity={o} />
          ))}
        </div>
      ) : (
        <SectionCard title="Nenhuma oportunidade observada agora" icon={Target} muted>
          <p className="text-sm text-muted">
            Nada cruzou os critérios neste momento. Isto não significa que o sistema parou de vigiar - eis o estado atual:
          </p>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-muted">Ciclo MZN⇄ZAR</span>
              <span className="font-mono">
                {monitoredCyclePct != null ? `${monitoredCyclePct >= 0 ? '+' : ''}${fmt(monitoredCyclePct)}%` : 'sem dados suficientes'}
                {monitoredCyclePct != null && monitoredCyclePct <= 0 && <span className="ml-2 text-xs text-muted">(negativo é o normal)</span>}
              </span>
            </div>
            {monitoredPairs.map((p) => (
              <div key={`${p.asset}-${p.fiat}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <span className="text-muted">
                  {p.asset}/{p.fiat}
                </span>
                <span className="font-mono text-xs">
                  spread {p.spreadPct != null ? `${fmt(p.spreadPct)}%` : '—'} · liquidez{' '}
                  {p.avgLiquidity != null ? fmt(p.avgLiquidity, 1) : '—'} · volatilidade{' '}
                  {p.volatilityBuyPct != null || p.volatilitySellPct != null
                    ? `até ${fmt(Math.max(p.volatilityBuyPct ?? 0, p.volatilitySellPct ?? 0))}%`
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
