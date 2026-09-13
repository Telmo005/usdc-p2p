import { requireUser } from '@/lib/auth';
import { getMarketSeries } from '@/lib/db';
import { getRealWalletSnapshot, getWalletMovements } from '@/lib/wallet';
import { StatCard } from '@/components/StatCard';
import { WalletMovementForm } from '@/components/WalletMovementForm';

const TYPE_LABEL: Record<string, string> = { deposit: 'Depósito', withdrawal: 'Levantamento', adjustment: 'Ajuste' };

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

export default async function WalletPage() {
  const { user } = await requireUser();

  const marketSeries = await getMarketSeries();
  const mzn = marketSeries.find((s) => s.fiat === 'MZN');
  const zar = marketSeries.find((s) => s.fiat === 'ZAR');
  const mznRate = mzn?.lastBuy != null && mzn?.lastSell != null ? (mzn.lastBuy + mzn.lastSell) / 2 : null;
  const zarRate = zar?.lastBuy != null && zar?.lastSell != null ? (zar.lastBuy + zar.lastSell) / 2 : null;

  let snapshot;
  let fetchError: string | null = null;
  try {
    snapshot = await getRealWalletSnapshot(mznRate, zarRate);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Falha ao ler o saldo da Binance.';
  }

  const movements = await getWalletMovements(user.id);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Carteira</h1>
        <p className="mt-1 text-sm text-muted">
          Saldo real, lido diretamente da tua conta Binance. Os totais de compra/venda das tuas operações ficam só no
          histórico (Ordens) e nas estatísticas - não entram nesta conta.
        </p>
      </div>

      {fetchError && (
        <div className="rounded-xl border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-negative">
          Não consegui ler o saldo agora: {fetchError}
        </div>
      )}

      {snapshot && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total (stablecoins)" value={`${fmt(snapshot.totalUsd, 4)} USD`} />
            <StatCard label="Equivalente em MZN" value={snapshot.totalMzn != null ? `${fmt(snapshot.totalMzn)} MZN` : '—'} />
            <StatCard label="Equivalente em ZAR" value={snapshot.totalZar != null ? `${fmt(snapshot.totalZar)} ZAR` : '—'} />
          </div>

          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">Saldo por ativo</h2>
            <p className="mt-1 text-xs text-muted">
              Direto da Binance (Spot), agora mesmo.
              {snapshot.mznRate != null && ` Câmbio usado: ${snapshot.mznRate.toFixed(4)} MZN por USD`}
              {snapshot.mznRate != null && snapshot.zarRate != null && ' · '}
              {snapshot.zarRate != null && `${snapshot.zarRate.toFixed(4)} ZAR por USD`}
              {(snapshot.mznRate != null || snapshot.zarRate != null) && ' (preço médio de mercado atual).'}
            </p>

            {snapshot.balances.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Sem saldo na conta Spot neste momento.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {snapshot.balances.map((b) => (
                  <div key={b.asset} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                    <span className="font-medium">{b.asset}</span>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="font-mono">{fmt(b.quantity, 8)}</span>
                      {b.usdEquivalent != null ? (
                        <>
                          <span className="text-muted">
                            ≈ <span className="font-mono text-foreground">{fmt(b.usdEquivalent, 4)} USD</span>
                          </span>
                          {mznRate != null && (
                            <span className="text-muted">
                              ≈ <span className="font-mono text-foreground">{fmt(b.usdEquivalent * mznRate)} MZN</span>
                            </span>
                          )}
                          {zarRate != null && (
                            <span className="text-muted">
                              ≈ <span className="font-mono text-foreground">{fmt(b.usdEquivalent * zarRate)} ZAR</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted">sem câmbio rastreado para este ativo</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Registo pessoal de transferências</h2>
        <p className="mt-1 text-xs text-muted">
          Só para o teu próprio registo de movimentos que a Binance não vê (ex.: transferência para outra exchange ou
          carteira). Isto é um caderno de notas - não altera nem soma ao saldo real acima.
        </p>
        <div className="mt-4">
          <WalletMovementForm />
        </div>
      </section>

      {movements.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Histórico do registo pessoal</h2>
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4">Valor</th>
                  <th className="pb-2 pr-4">Notas</th>
                  <th className="pb-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="py-2 pr-4">{TYPE_LABEL[m.type] ?? m.type}</td>
                    <td className="py-2 pr-4 font-mono">
                      {Number(m.amount) >= 0 && m.type !== 'withdrawal' ? '+' : m.type === 'withdrawal' ? '-' : ''}
                      {Math.abs(Number(m.amount)).toLocaleString('pt-PT', { maximumFractionDigits: 4 })} {m.asset}
                    </td>
                    <td className="py-2 pr-4 text-muted">{m.notes ?? '-'}</td>
                    <td className="py-2 text-muted">{new Date(m.created_at).toLocaleString('pt-PT')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-col gap-2 md:hidden">
            {movements.map((m) => (
              <div key={m.id} className="rounded-lg border border-border p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{TYPE_LABEL[m.type] ?? m.type}</span>
                  <span className="font-mono">
                    {Number(m.amount) >= 0 && m.type !== 'withdrawal' ? '+' : m.type === 'withdrawal' ? '-' : ''}
                    {Math.abs(Number(m.amount)).toLocaleString('pt-PT', { maximumFractionDigits: 4 })} {m.asset}
                  </span>
                </div>
                {m.notes && <div className="mt-1 text-muted">{m.notes}</div>}
                <div className="mt-1 text-muted">{new Date(m.created_at).toLocaleString('pt-PT')}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
