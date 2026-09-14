'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { planRoundTrip } from '@/lib/orderBookSimulator';
import { X, Search } from 'lucide-react';
import type { P2PAd } from '@/lib/binancePublicP2P';
import type { CapitalSettings } from '@/lib/capitalSettings';
import { FillStepList } from '@/components/FillStepList';
import { DataTag } from '@/components/DataTag';

export type PairBooks = { asset: string; fiat: string; buyAds: P2PAd[]; sellAds: P2PAd[]; fetchedAt: number };

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

/**
 * "With whom do I buy, with whom do I sell, what's the real profit" - for
 * amounts no single advertiser can fill alone. Every other simulator here
 * prices a trade at one aggregate number; this walks the real ad list
 * (already best-price-first) and builds a real multi-advertiser plan
 * instead (see lib/orderBookSimulator.ts). Manual only - "qual seria o
 * valor ideal" is a search, and that search now lives in the Opportunity
 * Center (lib/multiAdOpportunity.ts), not here.
 */
export function MultiAdSimulator({
  pairs,
  capitalSettings,
  initialAmount,
  initialPairIndex,
}: {
  pairs: PairBooks[];
  capitalSettings: CapitalSettings;
  initialAmount?: number;
  initialPairIndex?: number;
}) {
  const [pairIdx, setPairIdx] = useState(
    initialPairIndex != null && initialPairIndex >= 0 && initialPairIndex < pairs.length ? initialPairIndex : 0
  );
  const [amount, setAmount] = useState(String(initialAmount ?? 1000));
  const [useMpesaFee, setUseMpesaFee] = useState(true);

  const pair = pairs[pairIdx];
  const targetFiat = Number(amount);
  const mpesaApplicable = pair?.fiat === 'MZN';

  const plan = useMemo(() => {
    if (!pair || !(targetFiat > 0)) return null;
    return planRoundTrip(pair.buyAds, pair.sellAds, targetFiat, capitalSettings, mpesaApplicable && useMpesaFee);
  }, [pair, targetFiat, capitalSettings, mpesaApplicable, useMpesaFee]);

  const clearSimulation = () => {
    setAmount(String(initialAmount ?? 1000));
    setUseMpesaFee(true);
  };

  if (pairs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
        Sem anúncios reais disponíveis neste momento para simular com profundidade.
      </div>
    );
  }

  const buyShortfall = plan ? Math.max(0, targetFiat - plan.buy.filledFiat) : 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">Simular compra em vários anúncios</h2>
      <p className="mt-1 text-xs text-muted">
        Para um valor que nenhum anunciante sozinho consegue cobrir - usa os anúncios reais, um a um, não a média do mercado.
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <Search size={12} />
        Não sabes que valor simular? Vê as combinações que o sistema já testou em{' '}
        <Link href="/opportunities" className="font-medium text-accent hover:underline">
          Oportunidades
        </Link>
        .
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">Vou investir</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-40 rounded-lg border border-border bg-background px-3 py-2.5 text-lg font-semibold outline-none focus:border-accent"
            />
            <span className="text-sm text-muted">{pair.fiat}</span>
          </div>
        </label>

        <button
          type="button"
          onClick={clearSimulation}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted hover:border-negative hover:text-negative"
        >
          <X size={13} /> Limpar simulação
        </button>

        {pairs.length > 1 && (
          <div className="flex gap-1.5">
            {pairs.map((p, i) => (
              <button
                key={`${p.asset}-${p.fiat}`}
                type="button"
                onClick={() => setPairIdx(i)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  i === pairIdx ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'
                }`}
              >
                {p.asset}/{p.fiat}
              </button>
            ))}
          </div>
        )}

        <DataTag source="binance_public" fetchedAt={pair.fetchedAt} />
      </div>

      {mpesaApplicable && (
        <label className="mt-3 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={useMpesaFee} onChange={(e) => setUseMpesaFee(e.target.checked)} className="accent-accent" />
          Descontar taxa real de levantamento M-Pesa por comerciante (cada um cobra o seu próprio custo)
        </label>
      )}

      {plan && (
        <>
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              Comprar de ({fmt(plan.buy.filledFiat)} {pair.fiat} de {fmt(targetFiat)} {pair.fiat})
            </div>
            <FillStepList steps={plan.buy.steps} asset={pair.asset} fiat={pair.fiat} showMpesaFee={mpesaApplicable && useMpesaFee} />
            {buyShortfall > 0 && (
              <p className="mt-1.5 text-xs text-negative">
                Só consegui cobrir {fmt(plan.buy.filledFiat)} de {fmt(targetFiat)} {pair.fiat} com os anúncios visíveis agora -
                faltam {fmt(buyShortfall)} {pair.fiat}.
              </p>
            )}
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              Vender para ({fmt(plan.sell.filledQuantity, 4)} {pair.asset})
            </div>
            <FillStepList steps={plan.sell.steps} asset={pair.asset} fiat={pair.fiat} />
            {plan.unsoldQuantity > 0 && (
              <p className="mt-1.5 text-xs text-negative">
                {fmt(plan.unsoldQuantity, 4)} {pair.asset} comprados não têm comprador ao preço atual nos anúncios visíveis - ficam
                por vender nesta simulação.
              </p>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <div className="mb-3 flex justify-end">
              <DataTag source="simulated" />
            </div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <div className="text-xs text-muted">Resultado bruto</div>
                <div className="font-mono text-lg font-semibold">
                  {fmt(plan.grossResult)} {pair.fiat}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Custos</div>
                <div className="font-mono text-lg font-semibold">
                  {fmt(plan.configuredCosts + plan.mpesaFee)} {pair.fiat}
                </div>
                {plan.mpesaFee > 0 && <div className="text-[11px] text-muted">inclui {fmt(plan.mpesaFee)} {pair.fiat} de levantamento M-Pesa</div>}
              </div>
              <div>
                <div className="text-xs text-muted">Resultado líquido</div>
                <div className={`font-mono text-xl font-bold ${plan.netResult >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {plan.netResult >= 0 ? '+' : ''}
                  {fmt(plan.netResult)} {pair.fiat}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
