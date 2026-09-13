import { requireUser } from '@/lib/auth';
import { getWalletSummary, getWalletMovements } from '@/lib/wallet';
import { StatCard } from '@/components/StatCard';
import { WalletChart } from '@/components/WalletChart';
import { WalletMovementForm } from '@/components/WalletMovementForm';

const TYPE_LABEL: Record<string, string> = { deposit: 'Depósito', withdrawal: 'Levantamento', adjustment: 'Ajuste' };

export default async function WalletPage() {
  const { user } = await requireUser();
  const asset = 'USDT';

  const [summary, movements] = await Promise.all([getWalletSummary(user.id, asset), getWalletMovements(user.id, asset)]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Carteira</h1>
        <p className="mt-1 text-sm text-muted">
          Saldo real em {asset}: soma das tuas ordens concluídas (sincronizadas da Binance) com os depósitos, levantamentos e
          ajustes que registares aqui. Não é uma leitura direta do saldo da Binance - a chave de leitura desta app não tem
          acesso a isso.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`Saldo atual`} value={`${summary.currentBalance.toLocaleString('pt-PT', { maximumFractionDigits: 4 })} ${asset}`} />
        <StatCard label="Total depositado" value={`${summary.totalDeposited.toLocaleString('pt-PT', { maximumFractionDigits: 4 })} ${asset}`} />
        <StatCard label="Total levantado" value={`${summary.totalWithdrawn.toLocaleString('pt-PT', { maximumFractionDigits: 4 })} ${asset}`} />
        <StatCard
          label="Ajustes líquidos"
          value={`${summary.netAdjustments >= 0 ? '+' : ''}${summary.netAdjustments.toLocaleString('pt-PT', { maximumFractionDigits: 4 })} ${asset}`}
          tone={summary.netAdjustments === 0 ? 'neutral' : summary.netAdjustments > 0 ? 'positive' : 'negative'}
        />
      </div>

      {summary.tradingProfitByFiat.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Lucro de trading (das ordens concluídas, por moeda)</h2>
          <p className="mt-1 text-xs text-muted">
            Isto é diferente do saldo acima: o saldo é quantidade de {asset} que tens; isto é o dinheiro (fiat) que entrou vs
            saiu ao negociar. Um saldo maior não significa lucro se veio de um depósito.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {summary.tradingProfitByFiat.map((p) => (
              <div key={p.fiat} className="rounded-lg border border-border bg-background p-3">
                <div className="text-xs uppercase tracking-wide text-muted">{p.fiat}</div>
                <div className={`mt-1 font-mono text-lg font-bold ${p.profit >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {p.profit >= 0 ? '+' : ''}
                  {p.profit.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {p.fiat}
                </div>
                <div className="text-xs text-muted">
                  comprado {p.totalBuy.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} · vendido{' '}
                  {p.totalSell.toLocaleString('pt-PT', { maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Evolução do capital</h2>
        <p className="mt-1 text-xs text-muted">Cada ponto é um evento real: uma ordem concluída ou um movimento que registaste.</p>
        <div className="mt-4">
          <WalletChart evolution={summary.evolution} asset={asset} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Registar movimento</h2>
        <p className="mt-1 text-xs text-muted">
          Só para o que não vem das ordens sincronizadas: capital que entrou ou saiu da carteira por fora do P2P (ex.:
          transferência on-chain, ou uma correção).
        </p>
        <div className="mt-4">
          <WalletMovementForm />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Histórico de movimentos registados</h2>
        {movements.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Ainda sem depósitos, levantamentos ou ajustes registados.</p>
        ) : (
          <>
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
          </>
        )}
      </section>
    </div>
  );
}
