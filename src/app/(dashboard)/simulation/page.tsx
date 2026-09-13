import { requireUser } from '@/lib/auth';
import { getMarketSeries } from '@/lib/db';
import { getOpenLots, getPositionSummaries, getRecentSales } from '@/lib/simulation';
import { QuickSimulator } from '@/components/QuickSimulator';
import { CurrencyCycle } from '@/components/CurrencyCycle';
import { ProfitCalculator } from '@/components/ProfitCalculator';
import { PositionsTable, type LotRow } from '@/components/PositionsTable';
import { AddLotForm, RecordSaleForm } from '@/components/SimulationForms';
import { StatCard } from '@/components/StatCard';

export default async function SimulationPage() {
  const { user } = await requireUser();

  const [marketSeries, lots, positions, sales] = await Promise.all([
    getMarketSeries(),
    getOpenLots(user.id),
    getPositionSummaries(user.id),
    getRecentSales(user.id, 20),
  ]);

  const marketPairs = marketSeries.map((s) => ({ asset: s.asset, fiat: s.fiat, buyPrice: s.lastBuy, sellPrice: s.lastSell }));
  const marketPrices: Record<string, { buy: number | null; sell: number | null }> = {};
  for (const s of marketSeries) marketPrices[`${s.asset}/${s.fiat}`] = { buy: s.lastBuy, sell: s.lastSell };

  const lotRows: LotRow[] = lots.map((l) => ({
    id: l.id,
    asset: l.asset,
    fiat: l.fiat,
    quantity: Number(l.quantity),
    quantityRemaining: Number(l.quantity_remaining),
    buyPrice: Number(l.buy_price),
    buyFee: Number(l.buy_fee),
    notes: l.notes,
    createdAt: l.created_at,
  }));

  const totalUnrealized = positions.reduce((sum, p) => {
    const sell = marketPrices[`${p.asset}/${p.fiat}`]?.sell;
    if (sell == null) return sum;
    return sum + (p.quantityOpen * sell - p.totalCostBasis);
  }, 0);
  const totalRealized = sales.reduce((sum, s) => sum + Number(s.realized_profit), 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Simulação</h1>
        <p className="mt-1 text-sm text-muted">
          Regista as tuas compras, descobre o preço ideal de venda para o lucro que queres, e acompanha o lucro (real e por
          realizar) da tua posição a preços de mercado reais.
        </p>
      </div>

      <QuickSimulator pairs={marketPairs} />

      <CurrencyCycle pairs={marketPairs} />

      <details className="group rounded-xl border border-border bg-surface open:pb-5">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-muted marker:hidden group-open:text-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="transition group-open:rotate-90">▶</span> Calculadora avançada (planear um preço-alvo, teto de compra,
            quantidade)
          </span>
        </summary>
        <div className="px-5">
          <ProfitCalculator marketPairs={marketPairs} />
        </div>
      </details>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Quantidade em aberto" value={positions.length === 0 ? '—' : positions.map((p) => `${p.quantityOpen} ${p.asset}`).join(', ')} />
        <StatCard
          label="Lucro não realizado (a preço de mercado)"
          value={positions.length === 0 ? '—' : `${totalUnrealized.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          tone={totalUnrealized >= 0 ? 'positive' : 'negative'}
        />
        <StatCard
          label="Lucro já realizado (vendas registadas)"
          value={`${totalRealized.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          tone={totalRealized >= 0 ? 'positive' : 'negative'}
        />
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Registar compra</h2>
        <p className="mt-1 text-xs text-muted">
          Separado do histórico sincronizado da Binance - regista aqui qualquer compra (Binance, outra plataforma, dinheiro) que
          queiras incluir na simulação.
        </p>
        <div className="mt-4">
          <AddLotForm />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <PositionsTable lots={lotRows} marketPrices={marketPrices} />
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Registar venda</h2>
        <p className="mt-1 text-xs text-muted">
          A quantidade vendida é consumida das compras mais antigas primeiro (FIFO). Se a quantidade ultrapassar um lote, o
          resto sai do lote seguinte automaticamente.
        </p>
        <div className="mt-4">
          <RecordSaleForm />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Histórico de vendas</h2>
        {sales.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Ainda sem vendas registadas.</p>
        ) : (
          <>
            <div className="mt-3 hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4">Par</th>
                    <th className="pb-2 pr-4">Quantidade</th>
                    <th className="pb-2 pr-4">Preço de venda</th>
                    <th className="pb-2 pr-4">Lucro realizado</th>
                    <th className="pb-2">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="py-2 pr-4">
                        {s.asset}/{s.fiat}
                      </td>
                      <td className="py-2 pr-4 font-mono">{s.quantity}</td>
                      <td className="py-2 pr-4 font-mono">{s.sell_price}</td>
                      <td className={`py-2 pr-4 font-mono ${Number(s.realized_profit) >= 0 ? 'text-positive' : 'text-negative'}`}>
                        {Number(s.realized_profit).toFixed(2)} {s.fiat}
                      </td>
                      <td className="py-2 text-muted">{new Date(s.created_at).toLocaleString('pt-PT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-col gap-2 md:hidden">
              {sales.map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {s.asset}/{s.fiat} · {s.quantity} a {s.sell_price}
                    </span>
                    <span className={`font-mono ${Number(s.realized_profit) >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {Number(s.realized_profit).toFixed(2)} {s.fiat}
                    </span>
                  </div>
                  <div className="mt-1 text-muted">{new Date(s.created_at).toLocaleString('pt-PT')}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
