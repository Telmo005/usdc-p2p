import Link from 'next/link';
import { Wallet, Landmark, Sprout, NotebookPen, History, ArrowRightLeft } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMarketSeries } from '@/lib/db';
import { getRealWalletSnapshot, getWalletMovements, type WalletGroup } from '@/lib/wallet';
import { getMidRates } from '@/lib/exchangeRates';
import { TRACKED_PAIRS } from '@/lib/marketAnalysis';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { RefreshButton } from '@/components/RefreshButton';
import { WalletMovementForm } from '@/components/WalletMovementForm';
import { DataTag } from '@/components/DataTag';

const TYPE_LABEL: Record<string, string> = { deposit: 'Depósito', withdrawal: 'Levantamento', adjustment: 'Ajuste' };
const GROUP_ICON: Record<WalletGroup['id'], typeof Wallet> = { spot: Wallet, funding: Landmark };

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

function BalanceRow({
  label,
  quantity,
  quantityFrac,
  usdEquivalent,
  mznRate,
  zarRate,
  sub,
  simulateSellHref,
}: {
  label: string;
  quantity: number;
  quantityFrac: number;
  usdEquivalent: number | null;
  mznRate: number | null;
  zarRate: number | null;
  sub?: string;
  simulateSellHref?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
      <div>
        <span className="font-medium">{label}</span>
        {sub && <div className="text-[11px] text-muted">{sub}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-mono">{fmt(quantity, quantityFrac)}</span>
        {usdEquivalent != null ? (
          <>
            <span className="text-muted">
              ≈ <span className="font-mono text-foreground">{fmt(usdEquivalent, 4)} USD</span>
            </span>
            {mznRate != null && (
              <span className="text-muted">
                ≈ <span className="font-mono text-foreground">{fmt(usdEquivalent * mznRate)} MZN</span>
              </span>
            )}
            {zarRate != null && (
              <span className="text-muted">
                ≈ <span className="font-mono text-foreground">{fmt(usdEquivalent * zarRate)} ZAR</span>
              </span>
            )}
          </>
        ) : (
          <span className="text-muted">sem câmbio rastreado para este ativo</span>
        )}
        {simulateSellHref && (
          <Link
            href={simulateSellHref}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
          >
            <ArrowRightLeft size={11} /> Simular venda
          </Link>
        )}
      </div>
    </div>
  );
}

/** Which fiat to send a "Simular venda" link to for this asset: the
 *  profile's reference currency when that pair is actually tracked, else
 *  whichever tracked fiat this asset has. Null when the asset has no
 *  tracked market at all - there's no real price to simulate against. */
function trackedFiatFor(asset: string, referenceCurrency: string): string | null {
  const tracked = TRACKED_PAIRS.filter((p) => p.asset === asset);
  if (tracked.length === 0) return null;
  return tracked.find((p) => p.fiat === referenceCurrency)?.fiat ?? tracked[0].fiat;
}

export default async function WalletPage() {
  const { user, profile } = await requireUser();
  const referenceCurrency = profile?.reference_currency ?? 'MZN';

  const marketSeries = await getMarketSeries();
  const { mznRate, zarRate } = getMidRates(marketSeries);

  let snapshot: Awaited<ReturnType<typeof getRealWalletSnapshot>> | null = null;
  let fetchError: string | null = null;
  try {
    snapshot = await getRealWalletSnapshot(mznRate, zarRate);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Falha ao ler o saldo da Binance.';
  }

  const movements = await getWalletMovements(user.id);
  const hasAnyRealBalance = snapshot ? snapshot.totalUsd > 0 || snapshot.groups.some((g) => g.balances.length > 0) : false;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Carteira</h1>
          <p className="mt-1 text-sm text-muted">
            Saldo real, lido diretamente da tua conta Binance (Spot, Funding e Earn). Os totais de compra/venda das tuas
            operações ficam só no histórico e nas estatísticas - não entram aqui.
          </p>
        </div>
        <RefreshButton />
      </div>

      {fetchError && (
        <ErrorBanner
          title="Não consegui ler o saldo agora"
          message={`${fetchError} Tenta "Atualizar" acima - se persistir, confirma em Configurações que a chave da Binance ainda está ativa.`}
        />
      )}

      {snapshot && (
        <>
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-accent">Total em todas as carteiras</span>
              <DataTag source="binance_private" fetchedAt={snapshot.fetchedAt} label="Binance (conta)" />
            </div>
            <div className="mt-1 flex flex-wrap items-end gap-x-6 gap-y-1">
              <span className="font-mono text-3xl font-bold">{fmt(snapshot.totalUsd, 4)} USD</span>
              {snapshot.totalMzn != null && <span className="font-mono text-base text-muted">≈ {fmt(snapshot.totalMzn)} MZN</span>}
              {snapshot.totalZar != null && <span className="font-mono text-base text-muted">≈ {fmt(snapshot.totalZar)} ZAR</span>}
            </div>
            {(snapshot.mznRate != null || snapshot.zarRate != null) && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span>
                  Câmbio: {snapshot.mznRate != null && `${snapshot.mznRate.toFixed(4)} MZN por USD`}
                  {snapshot.mznRate != null && snapshot.zarRate != null && ' · '}
                  {snapshot.zarRate != null && `${snapshot.zarRate.toFixed(4)} ZAR por USD`} (preço médio de mercado atual)
                </span>
                <DataTag source="estimated" />
              </div>
            )}
          </div>

          {!hasAnyRealBalance && snapshot.earn.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Sem saldo em nenhuma carteira Binance neste momento"
              description="Assim que houver fundos em Spot, Funding ou Earn, aparecem aqui automaticamente."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {snapshot.groups.map((g) => {
                const Icon = GROUP_ICON[g.id];
                return (
                  <SectionCard key={g.id} title={g.label} subtitle={g.description} icon={Icon}>
                    {g.balances.length === 0 ? (
                      <EmptyState title="Vazia" description="Sem saldo nesta carteira agora." />
                    ) : (
                      <div className="flex flex-col gap-2">
                        {g.balances.map((b) => {
                          const sellFiat = b.quantity > 0 ? trackedFiatFor(b.asset, referenceCurrency) : null;
                          return (
                            <BalanceRow
                              key={b.asset}
                              label={b.asset}
                              quantity={b.quantity}
                              quantityFrac={8}
                              usdEquivalent={b.usdEquivalent}
                              mznRate={mznRate}
                              zarRate={zarRate}
                              simulateSellHref={
                                sellFiat
                                  ? `/simulation?asset=${b.asset}&fiat=${sellFiat}&wallet=${g.id}&qty=${b.quantity}`
                                  : undefined
                              }
                            />
                          );
                        })}
                        <div className="mt-1 flex justify-between border-t border-border pt-2 text-xs text-muted">
                          <span>Subtotal</span>
                          <span className="font-mono text-foreground">{fmt(g.totalUsd, 4)} USD</span>
                        </div>
                      </div>
                    )}
                  </SectionCard>
                );
              })}
            </div>
          )}

          <SectionCard
            title="Earn (Simple Earn Flexível)"
            subtitle="Capital a render juros na Binance - fica disponível para resgate, mas não é a mesma liquidez imediata de Spot/Funding."
            icon={Sprout}
          >
            {snapshot.earn.length === 0 ? (
              <EmptyState title="Sem posições em Earn" description="Nada alocado a produtos de rendimento neste momento." />
            ) : (
              <div className="flex flex-col gap-2">
                {snapshot.earn.map((e) => (
                  <div key={e.asset} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                    <div>
                      <span className="font-medium">{e.asset}</span>
                      <div className="text-[11px] text-positive">
                        APY atual {(e.apr * 100).toFixed(2)}% · rendimentos acumulados {fmt(e.cumulativeRewards, 6)} {e.asset}
                        {!e.canRedeem && ' · resgate indisponível agora'}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="font-mono">{fmt(e.principal, 8)}</span>
                      {e.usdEquivalent != null && (
                        <>
                          <span className="text-muted">
                            ≈ <span className="font-mono text-foreground">{fmt(e.usdEquivalent, 4)} USD</span>
                          </span>
                          {mznRate != null && (
                            <span className="text-muted">
                              ≈ <span className="font-mono text-foreground">{fmt(e.usdEquivalent * mznRate)} MZN</span>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div className="mt-1 flex justify-between border-t border-border pt-2 text-xs text-muted">
                  <span>Subtotal</span>
                  <span className="font-mono text-foreground">{fmt(snapshot.earnTotalUsd, 4)} USD</span>
                </div>
              </div>
            )}
          </SectionCard>
        </>
      )}

      <SectionCard
        title="Registo pessoal de transferências"
        subtitle="Só para o teu próprio registo de movimentos que a Binance não vê (ex.: transferência para outra exchange ou carteira). É um caderno de notas - não altera nem soma ao saldo real acima."
        icon={NotebookPen}
        muted
      >
        <WalletMovementForm />
      </SectionCard>

      {movements.length > 0 && (
        <SectionCard title="Histórico do registo pessoal" icon={History} muted>
          <div className="hidden overflow-x-auto md:block">
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

          <div className="flex flex-col gap-2 md:hidden">
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
        </SectionCard>
      )}
    </div>
  );
}
