'use client';

import { useMemo, useState } from 'react';

type Pair = { asset: string; fiat: string; buyPrice: number | null; sellPrice: number | null };

/**
 * MZN <-> ZAR via USDT: the original idea behind this whole app. Binance
 * doesn't quote MZN against ZAR directly, so the only real cross-rate
 * available is implied through USDT's own MZN and ZAR order books.
 */
export function CurrencyCycle({ pairs }: { pairs: Pair[] }) {
  const [amount, setAmount] = useState('1000');

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
    // numbers shown everywhere else are the real, executable ones.
    const midMzn = (mBuy + mSell) / 2;
    const midZar = (zBuy + zSell) / 2;
    const crossRate = midMzn / midZar; // MZN per 1 ZAR, implied by this market

    const zarBuyInMzn = zBuy * crossRate;
    const cheaperSide: 'MZN' | 'ZAR' = mBuy <= zarBuyInMzn ? 'MZN' : 'ZAR';
    const diffPct = (Math.abs(zarBuyInMzn - mBuy) / Math.min(mBuy, zarBuyInMzn)) * 100;

    const qtyA = amt / mBuy;
    const zarOut = qtyA * zSell;
    const qtyB = amt / zBuy;
    const mznOut = qtyB * mSell;

    // Full loop MZN-buy -> ZAR-sell -> ZAR-buy -> MZN-sell. Multiplication
    // is commutative, so this ratio is the same regardless of which
    // currency you call the "start" - one honest number either way.
    const cycleRatio = (zSell * mSell) / (mBuy * zBuy);
    const cyclePct = (cycleRatio - 1) * 100;

    return { mBuy, mSell, zBuy, zSell, crossRate, zarBuyInMzn, cheaperSide, diffPct, qtyA, zarOut, qtyB, mznOut, cyclePct };
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
        Compra em MZN, venda em ZAR - e o caminho inverso - usando os preços P2P reais de agora, para veres em que direção o
        negócio está mais vantajoso.
      </p>

      <label className="mt-4 flex max-w-[12rem] flex-col gap-1.5 text-sm">
        <span className="text-xs text-muted">Quantia (aplicada aos dois lados)</span>
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
            <div className="mt-1 text-xs text-muted">
              1 USDT: {calc.mBuy.toFixed(4)} MZN a comprar com MZN · {calc.zBuy.toFixed(4)} ZAR a comprar com ZAR ≈{' '}
              {calc.zarBuyInMzn.toFixed(4)} MZN equivalente (câmbio implícito: {calc.crossRate.toFixed(4)} MZN por ZAR, a partir
              do preço médio de cada par)
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-info">MZN → USDT → ZAR</div>
              <div className="mt-2 text-sm text-muted">
                {amount} MZN → compra {calc.qtyA.toLocaleString('pt-PT', { maximumFractionDigits: 4 })} USDT (a {calc.mBuy.toFixed(4)}{' '}
                MZN) → vende a {calc.zSell.toFixed(4)} ZAR
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-positive">
                {calc.zarOut.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ZAR
              </div>
              <div className="text-xs text-muted">taxa efetiva: {(calc.zarOut / Number(amount)).toFixed(4)} ZAR por MZN</div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-info">ZAR → USDT → MZN</div>
              <div className="mt-2 text-sm text-muted">
                {amount} ZAR → compra {calc.qtyB.toLocaleString('pt-PT', { maximumFractionDigits: 4 })} USDT (a {calc.zBuy.toFixed(4)}{' '}
                ZAR) → vende a {calc.mSell.toFixed(4)} MZN
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-positive">
                {calc.mznOut.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN
              </div>
              <div className="text-xs text-muted">taxa efetiva: {(calc.mznOut / Number(amount)).toFixed(4)} MZN por ZAR</div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <div className="text-xs uppercase tracking-wide text-muted">Eficiência do ciclo completo (ida e volta)</div>
            <div className={`mt-1 font-mono text-lg font-bold ${calc.cyclePct >= 0 ? 'text-positive' : 'text-negative'}`}>
              {calc.cyclePct >= 0 ? '+' : ''}
              {calc.cyclePct.toFixed(2)}%
            </div>
            <p className="mt-1 text-xs text-muted">
              {calc.cyclePct >= 0
                ? 'Positivo: comprar num lado e vender no outro, ida e volta, rende mais do que investiste - oportunidade real de arbitragem neste momento.'
                : 'Negativo é o normal: é o custo do spread ao atravessar os dois mercados duas vezes. Não é o mesmo que "não há lucro" em fazer só uma perna - vê os dois caminhos acima.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
