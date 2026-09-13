'use client';

import { useMemo, useState } from 'react';
import { DataTag } from '@/components/DataTag';

export type SellableBalance = { asset: string; wallet: 'spot' | 'funding'; quantity: number };
export type MarketPairWithAge = { asset: string; fiat: string; buyPrice: number | null; sellPrice: number | null; fetchedAt: number | null };

const WALLET_LABEL: Record<SellableBalance['wallet'], string> = { spot: 'Spot', funding: 'Funding' };

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

/**
 * "I already hold this, what do I get if I sell it right now" - distinct
 * from QuickSimulator (which models a future purchase). Quantity and price
 * come from real Binance data (see the binance_private/binance_public tags
 * below); only the final result is SIMULATED.
 */
export function WalletSaleSimulator({
  balances,
  marketPairs,
  mznRate,
  zarRate,
  walletFetchedAt,
  initialAsset,
  initialWallet,
  initialFiat,
  initialQuantity,
}: {
  balances: SellableBalance[];
  marketPairs: MarketPairWithAge[];
  mznRate: number | null;
  zarRate: number | null;
  walletFetchedAt: number;
  initialAsset?: string;
  initialWallet?: string;
  initialFiat?: string;
  initialQuantity?: number;
}) {
  const initialIdx = Math.max(
    0,
    balances.findIndex((b) => b.asset === initialAsset && (!initialWallet || b.wallet === initialWallet))
  );
  const [selectedIdx, setSelectedIdx] = useState(initialIdx);
  const selected = balances[selectedIdx];

  const availableFiats = useMemo(
    () => (selected ? [...new Set(marketPairs.filter((p) => p.asset === selected.asset).map((p) => p.fiat))] : []),
    [selected, marketPairs]
  );
  const [fiat, setFiat] = useState(initialFiat && availableFiats.includes(initialFiat) ? initialFiat : (availableFiats[0] ?? ''));
  // Falls back reactively if the selected balance changes to an asset that doesn't track the chosen fiat.
  const effectiveFiat = availableFiats.includes(fiat) ? fiat : (availableFiats[0] ?? '');

  const [quantity, setQuantity] = useState(String(initialQuantity ?? selected?.quantity ?? 0));
  const [fee, setFee] = useState('0');

  if (!selected) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
        Sem saldo real disponível para simular venda neste momento.
      </div>
    );
  }

  const pair = marketPairs.find((p) => p.asset === selected.asset && p.fiat === effectiveFiat);
  const sellPrice = pair?.sellPrice ?? null;

  const qty = Number(quantity);
  const feeAmount = Number(fee) || 0;
  const qtyValid = Number.isFinite(qty) && qty > 0 && qty <= selected.quantity + 1e-9;

  const result =
    qtyValid && sellPrice != null
      ? (() => {
          const gross = qty * sellPrice;
          const net = gross - feeAmount;
          let netUsd: number | null = null;
          if (effectiveFiat === 'MZN' && mznRate) netUsd = net / mznRate;
          else if (effectiveFiat === 'ZAR' && zarRate) netUsd = net / zarRate;
          const netMzn = effectiveFiat === 'MZN' ? net : netUsd != null && mznRate ? netUsd * mznRate : null;
          const netZar = effectiveFiat === 'ZAR' ? net : netUsd != null && zarRate ? netUsd * zarRate : null;
          return { gross, net, netUsd, netMzn, netZar };
        })()
      : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">Vender saldo real</h2>
      <p className="mt-1 text-xs text-muted">
        Usa o que já tens na Binance agora - a quantidade e o preço são reais, o resultado abaixo é uma simulação.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        {balances.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {balances.map((b, i) => (
              <button
                key={`${b.asset}-${b.wallet}`}
                type="button"
                onClick={() => {
                  setSelectedIdx(i);
                  setQuantity(String(b.quantity));
                }}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  i === selectedIdx ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'
                }`}
              >
                {b.asset} ({WALLET_LABEL[b.wallet]})
              </button>
            ))}
          </div>
        )}

        {availableFiats.length > 1 && (
          <div className="flex rounded-lg border border-border bg-background p-1 text-xs">
            {availableFiats.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiat(f)}
                className={`rounded-md px-3 py-1.5 font-medium transition ${f === effectiveFiat ? 'bg-accent text-accent-foreground' : 'text-muted'}`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Saldo disponível ({WALLET_LABEL[selected.wallet]}):</span>
        <span className="font-mono font-semibold">
          {fmt(selected.quantity, 8)} {selected.asset}
        </span>
        <DataTag source="binance_private" fetchedAt={walletFetchedAt} label="Binance (conta)" />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">Quantidade a vender</span>
          <input
            type="number"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setQuantity(String(selected.quantity))}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-foreground"
          >
            Tudo
          </button>
          <button
            type="button"
            onClick={() => setQuantity(String(selected.quantity / 2))}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-foreground"
          >
            50%
          </button>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">Custos (taxa, {effectiveFiat || 'fiat'})</span>
          <input
            type="number"
            step="any"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      {!qtyValid && (
        <p className="mt-3 text-xs text-negative">Quantidade tem de ser maior que zero e não pode exceder o saldo disponível.</p>
      )}

      {sellPrice != null ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          Preço de venda atual:{' '}
          <span className="font-mono text-foreground">
            {sellPrice.toFixed(4)} {effectiveFiat}/{selected.asset}
          </span>
          <DataTag source="binance_public" fetchedAt={pair?.fetchedAt ?? null} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Sem preço de mercado rastreado para {selected.asset}/{effectiveFiat || '-'} neste momento.
        </p>
      )}

      {result && (
        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex justify-end">
            <DataTag source="simulated" />
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <div className="text-xs text-muted">Valor bruto</div>
              <div className="font-mono text-lg font-semibold">
                {fmt(result.gross)} {effectiveFiat}
              </div>
            </div>
            <div className="text-xl text-muted">−</div>
            <div>
              <div className="text-xs text-muted">Custos</div>
              <div className="font-mono text-lg font-semibold">
                {fmt(feeAmount)} {effectiveFiat}
              </div>
            </div>
            <div className="text-xl text-muted">=</div>
            <div>
              <div className="text-xs text-muted">Valor líquido</div>
              <div className="font-mono text-xl font-bold text-positive">
                {fmt(result.net)} {effectiveFiat}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {result.netUsd != null && `≈ ${fmt(result.netUsd, 4)} USD`}
                {result.netMzn != null && effectiveFiat !== 'MZN' && ` · ≈ ${fmt(result.netMzn)} MZN`}
                {result.netZar != null && effectiveFiat !== 'ZAR' && ` · ≈ ${fmt(result.netZar)} ZAR`}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
