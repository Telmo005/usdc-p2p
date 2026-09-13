'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { computeProfit, maxBuyPrice, requiredQuantityForProfitAmount, requiredSellPrice } from '@/lib/profitCalculator';
import { DataTag } from '@/components/DataTag';

type Mode = 'sellPrice' | 'buyPrice' | 'profit' | 'quantity';

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: 'sellPrice', label: 'Já comprei → a que preço vender?', hint: 'Sabes o que pagaste. Diz o lucro mínimo que queres; calculamos o preço de venda necessário.' },
  { id: 'buyPrice', label: 'Vou vender → quanto posso pagar a comprar?', hint: 'Sabes a que preço vais vender. Diz o lucro mínimo; calculamos o teto médio de compra - podes comprar em vários anúncios/lotes desde que a média fique abaixo disso.' },
  { id: 'profit', label: 'Sei os dois preços → qual o lucro?', hint: 'Introduz compra e venda; mostramos o lucro em valor e em percentagem.' },
  { id: 'quantity', label: 'Sei os dois preços → quanta quantidade preciso?', hint: 'Diz o lucro em valor (não %) que queres alcançar; calculamos a quantidade necessária.' },
];

export function ProfitCalculator({
  marketPairs,
  initialAsset,
  initialFiat,
  initialSide,
  initialPrice,
}: {
  marketPairs: Array<{ asset: string; fiat: string; buyPrice: number | null; sellPrice: number | null }>;
  /** Arriving from a specific ad (Anúncios → Simular): its exact price is
   *  for one side only - the other stays editable/blank, and `mode`
   *  defaults to solving for that other side. */
  initialAsset?: string;
  initialFiat?: string;
  initialSide?: 'buy' | 'sell';
  initialPrice?: number;
}) {
  const [mode, setMode] = useState<Mode>(initialSide === 'sell' ? 'buyPrice' : 'sellPrice');
  const [asset, setAsset] = useState(initialAsset ?? 'USDT');
  const [fiat, setFiat] = useState(initialFiat ?? marketPairs[0]?.fiat ?? 'MZN');
  const [quantity, setQuantity] = useState('100');
  const [buyPrice, setBuyPrice] = useState(initialSide === 'buy' && initialPrice != null ? String(initialPrice) : '');
  const [sellPrice, setSellPrice] = useState(initialSide === 'sell' && initialPrice != null ? String(initialPrice) : '');
  const [buyFee, setBuyFee] = useState('0');
  const [sellFee, setSellFee] = useState('0');
  const [minProfitPct, setMinProfitPct] = useState('2');
  const [targetProfitAmount, setTargetProfitAmount] = useState('50');

  // Which field, if any, holds a real ad's exact price rather than a typed
  // guess or the aggregate market rate - purely for the DataTag below, never
  // recomputed after mount (the ad that was clicked doesn't change).
  const adPriceField = initialPrice != null ? initialSide : undefined;

  const n = (s: string) => {
    const v = Number(s);
    return Number.isFinite(v) ? v : NaN;
  };

  const applyMarketPrice = (pair: { asset: string; fiat: string; buyPrice: number | null; sellPrice: number | null }) => {
    setAsset(pair.asset);
    setFiat(pair.fiat);
    if (pair.buyPrice != null) setBuyPrice(pair.buyPrice.toFixed(4));
    if (pair.sellPrice != null) setSellPrice(pair.sellPrice.toFixed(4));
  };

  const result = useMemo(() => {
    const qty = n(quantity);
    const bFee = n(buyFee) || 0;
    const sFee = n(sellFee) || 0;

    if (mode === 'sellPrice') {
      const bPrice = n(buyPrice);
      const pct = n(minProfitPct);
      if (!(qty > 0) || !(bPrice > 0) || !Number.isFinite(pct)) return null;
      const solved = requiredSellPrice({ quantity: qty, buyPrice: bPrice, buyFee: bFee, sellFee: sFee, minProfitPct: pct });
      if (solved == null) return null;
      const profit = computeProfit({ quantity: qty, buyPrice: bPrice, sellPrice: solved, buyFee: bFee, sellFee: sFee });
      return { fields: { quantity: qty, buyPrice: bPrice, sellPrice: solved }, profit, solvedLabel: 'Preço de venda necessário', solvedValue: solved };
    }

    if (mode === 'buyPrice') {
      const sPrice = n(sellPrice);
      const pct = n(minProfitPct);
      if (!(qty > 0) || !(sPrice > 0) || !Number.isFinite(pct)) return null;
      const solved = maxBuyPrice({ quantity: qty, sellPrice: sPrice, sellFee: sFee, buyFee: bFee, minProfitPct: pct });
      if (solved == null) return null;
      const profit = computeProfit({ quantity: qty, buyPrice: solved, sellPrice: sPrice, buyFee: bFee, sellFee: sFee });
      return { fields: { quantity: qty, buyPrice: solved, sellPrice: sPrice }, profit, solvedLabel: 'Preço médio máximo de compra', solvedValue: solved };
    }

    if (mode === 'profit') {
      const bPrice = n(buyPrice);
      const sPrice = n(sellPrice);
      if (!(qty > 0) || !(bPrice > 0) || !(sPrice > 0)) return null;
      const profit = computeProfit({ quantity: qty, buyPrice: bPrice, sellPrice: sPrice, buyFee: bFee, sellFee: sFee });
      return { fields: { quantity: qty, buyPrice: bPrice, sellPrice: sPrice }, profit, solvedLabel: null, solvedValue: null };
    }

    // mode === 'quantity'
    const bPrice = n(buyPrice);
    const sPrice = n(sellPrice);
    const target = n(targetProfitAmount);
    if (!(bPrice > 0) || !(sPrice > 0) || !Number.isFinite(target)) return null;
    const solved = requiredQuantityForProfitAmount({ buyPrice: bPrice, sellPrice: sPrice, buyFee: bFee, sellFee: sFee, targetProfit: target });
    if (solved == null) return null;
    const profit = computeProfit({ quantity: solved, buyPrice: bPrice, sellPrice: sPrice, buyFee: bFee, sellFee: sFee });
    return { fields: { quantity: solved, buyPrice: bPrice, sellPrice: sPrice }, profit, solvedLabel: 'Quantidade necessária', solvedValue: solved };
  }, [mode, quantity, buyPrice, sellPrice, buyFee, sellFee, minProfitPct, targetProfitAmount]);

  const activeMode = MODES.find((m) => m.id === mode)!;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">Calculadora de lucro</h2>
      <p className="mt-1 text-xs text-muted">{activeMode.hint}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              mode === m.id ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {marketPairs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="self-center text-xs text-muted">Preço de mercado atual:</span>
          {marketPairs.map((p) => (
            <button
              key={`${p.asset}-${p.fiat}`}
              type="button"
              onClick={() => applyMarketPrice(p)}
              className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent"
            >
              {p.asset}/{p.fiat}: compra {p.buyPrice?.toFixed(2) ?? '-'} · venda {p.sellPrice?.toFixed(2) ?? '-'}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumField label={`Quantidade (${asset})`} value={quantity} onChange={setQuantity} readOnly={mode === 'quantity'} highlight={mode === 'quantity'} />
        <NumField
          label={`Preço de compra (${fiat})`}
          value={buyPrice}
          onChange={setBuyPrice}
          readOnly={mode === 'buyPrice'}
          highlight={mode === 'buyPrice'}
          tag={adPriceField === 'buy' ? <DataTag source="binance_public" label="preço deste anúncio" /> : undefined}
        />
        <NumField
          label={`Preço de venda (${fiat})`}
          value={sellPrice}
          onChange={setSellPrice}
          readOnly={mode === 'sellPrice'}
          highlight={mode === 'sellPrice'}
          tag={adPriceField === 'sell' ? <DataTag source="binance_public" label="preço deste anúncio" /> : undefined}
        />
        {mode === 'quantity' ? (
          <NumField label={`Lucro alvo (${fiat})`} value={targetProfitAmount} onChange={setTargetProfitAmount} />
        ) : (
          <NumField label="Lucro mínimo (%)" value={minProfitPct} onChange={setMinProfitPct} disabled={mode === 'profit'} />
        )}
        <NumField label={`Taxa de compra (${fiat})`} value={buyFee} onChange={setBuyFee} small />
        <NumField label={`Taxa de venda (${fiat})`} value={sellFee} onChange={setSellFee} small />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">Ativo</span>
          <input value={asset} onChange={(e) => setAsset(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">Fiat</span>
          <input value={fiat} onChange={(e) => setFiat(e.target.value.toUpperCase())} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
        </label>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-background p-4">
        {!result ? (
          <p className="text-sm text-muted">Preenche os valores para veres o resultado.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-6">
              {result.solvedLabel && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted">{result.solvedLabel}</div>
                  <div className="font-mono text-xl font-bold text-accent">
                    {result.solvedValue!.toLocaleString('pt-PT', { maximumFractionDigits: 4 })} {result.solvedLabel.includes('Quantidade') ? asset : fiat}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs uppercase tracking-wide text-muted">Lucro</div>
                <div className={`font-mono text-xl font-bold ${result.profit.profit >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {result.profit.profit.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {fiat} (
                  {result.profit.profitPct >= 0 ? '+' : ''}
                  {result.profit.profitPct.toFixed(2)}%)
                </div>
              </div>
              <div className="text-xs text-muted">
                Custo total: {result.profit.cost.toFixed(2)} {fiat} · Retorno total: {result.profit.proceeds.toFixed(2)} {fiat}
              </div>
            </div>
            <DataTag source="simulated" />
          </div>
        )}
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  readOnly,
  disabled,
  highlight,
  small,
  tag,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  highlight?: boolean;
  small?: boolean;
  tag?: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {label}
        {tag}
      </span>
      <input
        type="number"
        step="any"
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-lg border px-3 py-2 text-sm outline-none ${
          highlight
            ? 'border-accent/50 bg-accent/5 font-semibold text-accent'
            : 'border-border bg-background text-foreground focus:border-accent'
        } ${disabled ? 'opacity-40' : ''} ${small ? 'text-xs' : ''}`}
      />
    </label>
  );
}
