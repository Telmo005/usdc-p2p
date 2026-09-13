'use client';

import { useState } from 'react';
import { computeProfit, requiredSellPrice } from '@/lib/profitCalculator';

export type LotRow = {
  id: string;
  asset: string;
  fiat: string;
  quantity: number;
  quantityRemaining: number;
  buyPrice: number;
  buyFee: number;
  notes: string | null;
  createdAt: string;
};

export function PositionsTable({ lots, marketPrices }: { lots: LotRow[]; marketPrices: Record<string, { buy: number | null; sell: number | null }> }) {
  const [minProfitPct, setMinProfitPct] = useState('2');
  const pct = Number(minProfitPct);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Posições abertas</h3>
        <label className="flex items-center gap-2 text-xs text-muted">
          Lucro mínimo desejado
          <input
            type="number"
            step="any"
            value={minProfitPct}
            onChange={(e) => setMinProfitPct(e.target.value)}
            className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-accent"
          />
          %
        </label>
      </div>

      {lots.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Ainda não registaste nenhuma compra para simulação.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4">Par</th>
                <th className="pb-2 pr-4">Quantidade aberta</th>
                <th className="pb-2 pr-4">Preço de compra</th>
                <th className="pb-2 pr-4">Preço de venda p/ {isFinite(pct) ? pct : 0}% lucro</th>
                <th className="pb-2 pr-4">Preço de mercado (venda)</th>
                <th className="pb-2">Lucro/prejuízo ao preço de mercado</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const feeForRemaining = lot.quantity > 0 ? lot.buyFee * (lot.quantityRemaining / lot.quantity) : 0;
                const suggested = Number.isFinite(pct)
                  ? requiredSellPrice({ quantity: lot.quantityRemaining, buyPrice: lot.buyPrice, buyFee: feeForRemaining, sellFee: 0, minProfitPct: pct })
                  : null;
                const market = marketPrices[`${lot.asset}/${lot.fiat}`];
                const marketProfit =
                  market?.sell != null
                    ? computeProfit({ quantity: lot.quantityRemaining, buyPrice: lot.buyPrice, sellPrice: market.sell, buyFee: feeForRemaining, sellFee: 0 })
                    : null;

                return (
                  <tr key={lot.id} className="border-t border-border">
                    <td className="py-2 pr-4">
                      {lot.asset}/{lot.fiat}
                      {lot.notes && <div className="text-xs text-muted">{lot.notes}</div>}
                    </td>
                    <td className="py-2 pr-4 font-mono">{lot.quantityRemaining}</td>
                    <td className="py-2 pr-4 font-mono">{lot.buyPrice.toFixed(4)}</td>
                    <td className="py-2 pr-4 font-mono text-accent">{suggested != null ? suggested.toFixed(4) : '-'}</td>
                    <td className="py-2 pr-4 font-mono">{market?.sell != null ? market.sell.toFixed(4) : 'sem dados'}</td>
                    <td className={`py-2 font-mono ${marketProfit && marketProfit.profit >= 0 ? 'text-positive' : marketProfit ? 'text-negative' : 'text-muted'}`}>
                      {marketProfit ? `${marketProfit.profit.toFixed(2)} ${lot.fiat} (${marketProfit.profitPct.toFixed(2)}%)` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
