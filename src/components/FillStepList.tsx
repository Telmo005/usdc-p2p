import type { FillStep } from '@/lib/orderBookSimulator';
import { getMPesaWithdrawalFee } from '@/lib/mpesaFees';

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

/** Real per-merchant fill steps (Phase 10), shared by the manual simulator
 *  (MultiAdSimulator) and the auto-search opportunity card - both render
 *  the exact same real per-ad execution, so this only lives in one place. */
export function FillStepList({
  steps,
  asset,
  fiat,
  showMpesaFee,
}: {
  steps: FillStep[];
  asset: string;
  fiat: string;
  showMpesaFee?: boolean;
}) {
  if (steps.length === 0) {
    return <p className="text-xs text-muted">Sem anúncios que sirvam para este valor neste momento.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((s) => {
        // Cada comerciante cobra o seu próprio custo de levantamento -
        // dividir por vários anunciantes não é o mesmo que levantar tudo
        // de uma vez (o tarifário é escalonado, ver lib/mpesaFees.ts).
        const stepFee = showMpesaFee ? getMPesaWithdrawalFee(s.fiatValue) : 0;
        return (
          <div key={s.advNo} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-xs">
            <span className="flex items-center gap-1.5">
              {s.advertiserNickname}
              {s.advertiserIsMerchant && <span className="rounded bg-accent/10 px-1 py-0.5 text-[10px] text-accent">merchant</span>}
            </span>
            <span className="font-mono">
              {fmt(s.quantity, 4)} {asset} a {fmt(s.price, 4)} {fiat} = {fmt(s.fiatValue)} {fiat}
              {stepFee > 0 && <span className="text-negative"> (+{fmt(stepFee)} {fiat} levantamento)</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
