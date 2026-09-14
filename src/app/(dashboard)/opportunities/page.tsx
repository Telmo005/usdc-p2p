import { Target, Search } from 'lucide-react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getMarketSeries } from '@/lib/db';
import { getRealWalletSnapshot } from '@/lib/wallet';
import { getMidRates } from '@/lib/exchangeRates';
import { getOpportunities } from '@/lib/opportunities';
import { getMultiAdOpportunities } from '@/lib/multiAdOpportunity';
import { fromProfile } from '@/lib/capitalSettings';
import { OpportunityCard } from '@/components/OpportunityCard';
import { FillStepList } from '@/components/FillStepList';
import { DataTag } from '@/components/DataTag';
import { SectionCard } from '@/components/ui/SectionCard';

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

export default async function OpportunitiesPage() {
  const { profile } = await requireUser();
  const capitalSettings = fromProfile(profile);

  const marketSeries = await getMarketSeries();
  const { mznRate, zarRate } = getMidRates(marketSeries);
  let realTotalMzn: number | null = null;
  try {
    const walletSnapshot = await getRealWalletSnapshot(mznRate, zarRate);
    realTotalMzn = walletSnapshot.totalMzn;
  } catch {
    // Wallet read failed - getOpportunities falls back to the manual
    // reference amount, same as when referenceMode is 'manual'.
  }

  const [{ opportunities, monitoredCyclePct, monitoredPairs }, multiAdOpportunities] = await Promise.all([
    getOpportunities(capitalSettings, realTotalMzn),
    getMultiAdOpportunities(capitalSettings),
  ]);

  const profitableMultiAd = multiAdOpportunities.filter((o) => o.result.isProfitable);
  const unprofitableMultiAd = multiAdOpportunities.filter((o) => !o.result.isProfitable);

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

      <SectionCard
        title="Melhor valor para simular agora"
        icon={Search}
        subtitle="Procura real entre 600 e 30 000 MZN (passo de 1 MZN, nunca um valor saltado) nos anúncios reais de compra e venda de cada par - só aparece como recomendação quando o resultado líquido real é positivo."
      >
        {profitableMultiAd.length === 0 ? (
          <p className="text-sm text-muted">
            {unprofitableMultiAd.length > 0
              ? `${unprofitableMultiAd
                  .map(
                    (o) =>
                      `USDT/${o.fiat} (testei ${o.result.evaluated} valores reais entre ${fmt(o.result.candidateRange.min)} e ${fmt(o.result.candidateRange.max)} ${o.fiat} contra ${o.buyAdsCount} anúncios de compra e ${o.sellAdsCount} de venda)`
                  )
                  .join('; ')} - nenhuma combinação deu lucro líquido positivo neste momento.`
              : 'Sem anúncios reais suficientes neste momento para procurar um valor ideal.'}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {profitableMultiAd.map((o) => {
              const { result } = o;
              const { bestPlan } = result;
              const yieldPct = (bestPlan.netResult / result.bestAmount) * 100;
              // Câmbio efetivo: o preço real médio pago/recebido pelos vários
              // comerciantes, com todos os custos (configurados + M-Pesa)
              // somados ao lado da compra, onde são cobrados - não o preço
              // de tabela de um único anúncio.
              const effectiveBuyRate =
                bestPlan.buy.filledQuantity > 0 ? (bestPlan.buy.filledFiat + bestPlan.configuredCosts + bestPlan.mpesaFee) / bestPlan.buy.filledQuantity : null;
              return (
                <div key={`${o.asset}-${o.fiat}`} className="rounded-lg border border-positive/40 bg-positive/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">
                      USDT/{o.fiat}: simular {fmt(result.bestAmount)} {o.fiat}
                    </h3>
                    <DataTag source="binance_public" fetchedAt={o.booksFetchedAt} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1">
                    <span className="font-mono text-lg font-semibold text-positive">
                      +{fmt(bestPlan.netResult)} {o.fiat}
                    </span>
                    <span className="text-xs text-muted">rendimento {fmt(yieldPct)}% sobre o valor investido</span>
                  </div>
                  {effectiveBuyRate != null && bestPlan.sell.avgPrice != null && (
                    <div className="mt-2 text-xs text-muted">
                      Câmbio final com taxas:{' '}
                      <span className="font-mono font-semibold text-foreground">
                        {fmt(effectiveBuyRate, 4)} → {fmt(bestPlan.sell.avgPrice, 4)} {o.fiat}/{o.asset}
                      </span>{' '}
                      (compra {fmt(bestPlan.buy.avgPrice ?? 0, 4)} {o.fiat}/{o.asset} sem taxas)
                    </div>
                  )}
                  <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs text-muted">
                    <li>
                      Testei {result.evaluated} valores reais entre {fmt(result.candidateRange.min)} e {fmt(result.candidateRange.max)}{' '}
                      {o.fiat} (passos de {result.candidateRange.step} {o.fiat}) contra {o.buyAdsCount} anúncios de compra e{' '}
                      {o.sellAdsCount} de venda visíveis agora.
                    </li>
                    <li>
                      {result.hitCeiling
                        ? `Este valor atingiu o teto da pesquisa (${fmt(result.candidateRange.max)} ${o.fiat}) - com mais liquidez visível o valor ideal podia ser ainda maior.`
                        : 'Este valor ficou abaixo do teto da pesquisa porque a partir dele o lucro líquido real começa a cair.'}
                    </li>
                  </ul>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Comprar de</div>
                      <FillStepList steps={result.bestPlan.buy.steps} asset={o.asset} fiat={o.fiat} showMpesaFee={o.fiat === 'MZN'} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Vender para</div>
                      <FillStepList steps={result.bestPlan.sell.steps} asset={o.asset} fiat={o.fiat} />
                    </div>
                  </div>
                  <Link
                    href={`/simulation?pair=${o.asset}-${o.fiat}&amount=${result.bestAmount}`}
                    className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
                  >
                    Simular este valor na Simulação →
                  </Link>
                </div>
              );
            })}
            {unprofitableMultiAd.length > 0 && (
              <p className="text-xs text-muted">
                {unprofitableMultiAd.map((o) => `USDT/${o.fiat}`).join(', ')}: nenhuma combinação rentável encontrada neste momento.
              </p>
            )}
          </div>
        )}
      </SectionCard>

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
