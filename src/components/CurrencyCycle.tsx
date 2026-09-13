'use client';

import { useMemo, useState } from 'react';
import { DataTag } from '@/components/DataTag';

type Pair = { asset: string; fiat: string; buyPrice: number | null; sellPrice: number | null };

function fmtRand(mznPerRand: number) {
  return `R1 = ${mznPerRand.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} MZN`;
}

/**
 * MZN -> ZAR -> MZN via USDT: the original idea behind this whole app.
 * Binance doesn't quote MZN against ZAR directly, so the only real
 * cross-rate available is implied through USDT's own MZN and ZAR order
 * books. Everything is anchored to one MZN amount - the "volta" leg
 * converts back the actual ZAR the "ida" leg produced, not an unrelated
 * round number, so the whole thing reads as one real trip, not two
 * disconnected what-ifs. All ZAR/MZN rates are shown the way this market
 * actually quotes the Rand: "R1 = X MZN".
 */
export function CurrencyCycle({ pairs, initialAmount }: { pairs: Pair[]; initialAmount?: number }) {
  const [amount, setAmount] = useState(String(initialAmount ?? 1000));

  const mzn = pairs.find((p) => p.fiat === 'MZN' && p.buyPrice != null && p.sellPrice != null);
  const zar = pairs.find((p) => p.fiat === 'ZAR' && p.buyPrice != null && p.sellPrice != null);

  const calc = useMemo(() => {
    const amt = Number(amount);
    if (!mzn || !zar || !(amt > 0)) return null;

    const mBuy = mzn.buyPrice!;
    const mSell = mzn.sellPrice!;
    const zBuy = zar.buyPrice!;
    const zSell = zar.sellPrice!;

    // Mid-price of each pair, used only to normalize MZN and ZAR onto the
    // same footing for the "which is cheaper" verdict - the actual buy/sell
    // numbers used for the ida/volta trip below are the real, executable ones.
    const midMzn = (mBuy + mSell) / 2;
    const midZar = (zBuy + zSell) / 2;
    const midRate = midMzn / midZar; // R1 = this many MZN, implied mid-market
    const zarBuyInMzn = zBuy * midRate;
    const cheaperSide: 'MZN' | 'ZAR' = mBuy <= zarBuyInMzn ? 'MZN' : 'ZAR';
    const diffPct = (Math.abs(zarBuyInMzn - mBuy) / Math.min(mBuy, zarBuyInMzn)) * 100;

    // Ida: the MZN amount entered, converted to ZAR via USDT.
    const qtyIda = amt / mBuy;
    const zarOut = qtyIda * zSell;
    const idaRate = amt / zarOut; // R1 = this many MZN, this trip's real cost

    // Volta: the ZAR the ida leg actually produced, converted back to MZN.
    const qtyVolta = zarOut / zBuy;
    const mznBack = qtyVolta * mSell;
    const voltaRate = mznBack / zarOut; // R1 = this many MZN, this trip's real return

    const roundProfit = mznBack - amt;
    const roundPct = (mznBack / amt - 1) * 100;

    return { mBuy, mSell, zBuy, zSell, midRate, zarBuyInMzn, cheaperSide, diffPct, qtyIda, zarOut, idaRate, qtyVolta, mznBack, voltaRate, roundProfit, roundPct };
  }, [mzn, zar, amount]);

  if (!mzn || !zar) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
        Câmbio MZN ⇄ ZAR via USDT: preciso de preços reais de ambos os pares (USDT/MZN e USDT/ZAR) para simular. Ainda a
        recolher dados de um deles.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">Câmbio MZN ⇄ ZAR via USDT</h2>
      <p className="mt-1 text-xs text-muted">
        Partindo de uma quantia em MZN: quanto ZAR isso dá agora, e quanto voltarias a ter em MZN se trocasses esse ZAR de
        volta - tudo com os preços P2P reais deste momento.
      </p>

      <label className="mt-4 flex max-w-[12rem] flex-col gap-1.5 text-sm">
        <span className="text-xs text-muted">Quantia em MZN</span>
        <input
          type="number"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
        />
      </label>

      {calc && (
        <>
          <div className="mt-4 rounded-lg border border-accent/40 bg-accent/5 p-4">
            <div className="text-xs uppercase tracking-wide text-accent">Onde está mais barato comprar USDT agora</div>
            <div className="mt-1 text-lg font-bold">
              Comprar com <span className="text-accent">{calc.cheaperSide}</span> está {calc.diffPct.toFixed(2)}% mais barato
              (câmbio implícito do próprio mercado)
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>
                1 USDT: {calc.mBuy.toFixed(4)} MZN a comprar com MZN · {calc.zBuy.toFixed(4)} ZAR a comprar com ZAR ≈{' '}
                {calc.zarBuyInMzn.toFixed(4)} MZN equivalente · câmbio médio implícito: {fmtRand(calc.midRate)}
              </span>
              <DataTag source="estimated" />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-info">1. Ida: MZN → USDT → ZAR</div>
              <div className="mt-2 text-sm text-muted">
                {Number(amount).toLocaleString('pt-PT')} MZN → compra {calc.qtyIda.toLocaleString('pt-PT', { maximumFractionDigits: 4 })}{' '}
                USDT (a {calc.mBuy.toFixed(4)} MZN/USDT) → vende a {calc.zSell.toFixed(4)} ZAR/USDT
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="font-mono text-xl font-bold text-positive">
                  {calc.zarOut.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ZAR
                </span>
                <span className="text-xs text-muted">custo real desta viagem: {fmtRand(calc.idaRate)}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-info">
                2. Volta: esses {calc.zarOut.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} ZAR → USDT → MZN
              </div>
              <div className="mt-2 text-sm text-muted">
                {calc.zarOut.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} ZAR → compra{' '}
                {calc.qtyVolta.toLocaleString('pt-PT', { maximumFractionDigits: 4 })} USDT (a {calc.zBuy.toFixed(4)} ZAR/USDT) →
                vende a {calc.mSell.toFixed(4)} MZN/USDT
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="font-mono text-xl font-bold text-positive">
                  {calc.mznBack.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN
                </span>
                <span className="text-xs text-muted">retorno real desta viagem: {fmtRand(calc.voltaRate)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wide text-muted">Resultado da viagem completa (ida e volta)</div>
              <DataTag source="simulated" />
            </div>
            <div className="mt-1 text-sm">
              Começaste com {Number(amount).toLocaleString('pt-PT')} MZN, ficas com{' '}
              <span className="font-mono font-semibold">{calc.mznBack.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} MZN</span>
            </div>
            <div className={`mt-1 font-mono text-lg font-bold ${calc.roundProfit >= 0 ? 'text-positive' : 'text-negative'}`}>
              {calc.roundProfit >= 0 ? '+' : ''}
              {calc.roundProfit.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN (
              {calc.roundPct >= 0 ? '+' : ''}
              {calc.roundPct.toFixed(2)}%)
            </div>
            <p className="mt-1 text-xs text-muted">
              {calc.roundProfit >= 0
                ? 'Positivo: ida e volta agora mesmo rende mais do que investiste - oportunidade real de arbitragem neste momento.'
                : 'Negativo é o normal: é o custo do spread ao atravessar os dois mercados duas vezes. Não significa que não haja lucro em fazer só a ida ou só a volta isoladamente para um cliente.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
