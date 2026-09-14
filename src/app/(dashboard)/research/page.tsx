import { FlaskConical } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMarketSeries } from '@/lib/db';
import { TRACKED_PAIRS } from '@/lib/marketAnalysis';
import { runBacktest, type BacktestRule } from '@/lib/researchLab';
import { fromProfile } from '@/lib/capitalSettings';
import { DataTag } from '@/components/DataTag';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ResearchRuleForm } from '@/components/ResearchRuleForm';

type Kind = BacktestRule['kind'];
const KINDS: Kind[] = ['price', 'spread', 'liquidity', 'cycle'];

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

function fmtDateTime(t: number) {
  return new Date(t).toLocaleString('pt-PT');
}

export default async function ResearchLabPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; asset?: string; fiat?: string; side?: string; operator?: string; threshold?: string; days?: string }>;
}) {
  const { profile } = await requireUser();
  const capitalSettings = fromProfile(profile);
  const sp = await searchParams;

  const kind: Kind = KINDS.includes(sp.kind as Kind) ? (sp.kind as Kind) : 'cycle';
  const asset = sp.asset ?? 'USDT';
  const fiat = sp.fiat ?? 'MZN';
  const side: 'buy' | 'sell' = sp.side === 'buy' ? 'buy' : 'sell';
  const operator: 'gte' | 'lte' = sp.operator === 'lte' ? 'lte' : 'gte';
  const threshold = Number(sp.threshold ?? '0');
  const days = Math.min(365, Math.max(1, Number(sp.days ?? '30')));

  let rule: BacktestRule;
  if (kind === 'price') rule = { kind, asset, fiat, side, operator, threshold };
  else if (kind === 'spread') rule = { kind, asset, fiat, operator, threshold };
  else if (kind === 'liquidity') rule = { kind, asset, fiat, side, operator, threshold };
  else rule = { kind: 'cycle', operator, threshold };

  const series = await getMarketSeries(days * 24);
  const result = runBacktest(rule, series, capitalSettings, true);

  const avgHoursBetween =
    result.events.length > 1
      ? (result.events[result.events.length - 1].t - result.events[0].t) / (result.events.length - 1) / 3_600_000
      : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <FlaskConical size={18} />
        </span>
        <div>
          <h1 className="text-xl font-bold">Research Lab</h1>
          <p className="mt-1 text-sm text-muted">
            &quot;Se eu tivesse usado esta regra no período X, o que teria acontecido?&quot; - testada sobre os dados reais que
            este sistema já recolheu. Nunca uma garantia de resultado futuro.
          </p>
        </div>
      </div>

      <SectionCard title="Definir regra">
        <ResearchRuleForm pairs={TRACKED_PAIRS} initial={{ kind, asset, fiat, side, operator, threshold, days }} />
      </SectionCard>

      <SectionCard
        title="Resultado"
        action={<DataTag source="historical" />}
        subtitle={`${result.ticksExamined} pontos de dados reais examinados nos últimos ${days} dia${days === 1 ? '' : 's'}`}
      >
        <div className="mb-3 rounded-lg border border-accent/40 bg-accent/5 p-3 text-xs font-semibold uppercase tracking-wide text-accent">
          Simulação histórica - nunca uma garantia de resultado futuro
        </div>

        {result.ticksExamined === 0 ? (
          <EmptyState
            title="Ainda sem histórico suficiente"
            description="Este sistema ainda não acumulou dados reais suficientes para este par/período - volta mais tarde."
          />
        ) : result.events.length === 0 ? (
          <p className="text-sm text-muted">Esta regra não teria disparado nenhuma vez no período escolhido.</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Disparou <span className="font-semibold text-foreground">{result.events.length}</span> vez
              {result.events.length === 1 ? '' : 'es'} em {days} dias
              {avgHoursBetween != null && ` - em média 1 vez a cada ${fmt(avgHoursBetween, 1)}h`}.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              {result.events
                .slice()
                .reverse()
                .slice(0, 50)
                .map((e) => (
                  <div key={e.t} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                    <span className="text-muted">{fmtDateTime(e.t)}</span>
                    <span className="font-mono">
                      {kind === 'cycle' || kind === 'spread' ? `${fmt(e.value)}%` : `${fmt(e.value, 4)} ${kind === 'liquidity' ? 'anúncios' : fiat}`}
                    </span>
                    {e.netResult != null ? (
                      <span className={`font-mono font-semibold ${e.netResult >= 0 ? 'text-positive' : 'text-negative'}`}>
                        {e.netResult >= 0 ? '+' : ''}
                        {fmt(e.netResult)} MZN
                      </span>
                    ) : (
                      <span className="text-xs text-muted">
                        sem resultado aqui - esta regra não define quando venderias; usa a Simulação para planear um valor concreto
                        a este preço.
                      </span>
                    )}
                  </div>
                ))}
            </div>
            {result.events.length > 50 && <p className="mt-2 text-xs text-muted">A mostrar os 50 disparos mais recentes de {result.events.length}.</p>}
          </>
        )}
      </SectionCard>
    </div>
  );
}
