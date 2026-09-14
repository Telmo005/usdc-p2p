'use client';

import { useActionState, useState } from 'react';
import { Bell, BellOff, Trash2 } from 'lucide-react';
import { createAlertAction, toggleAlertAction, deleteAlertAction, type AlertActionState } from '@/app/actions/alerts';
import { describeCondition } from '@/lib/alertDescriptions';
import type { Alert, AlertCondition } from '@/lib/alerts';

type Pair = { asset: string; fiat: string; buyPrice: number | null; sellPrice: number | null };
type Kind = AlertCondition['kind'];

const KIND_LABEL: Record<Kind, string> = {
  price: 'Preço de um par',
  cycle: 'Ciclo de arbitragem MZN⇄ZAR',
  spread: 'Spread de um par',
  liquidity: 'Liquidez (nº de anúncios)',
  account_balance: 'Saldo total abaixo de um limite',
  account_change_pct: 'Variação inesperada do saldo',
  multi_ad_opportunity: 'Oportunidade multi-anúncio (sem taxas)',
};

function CreateAlertForm({ pairs, kinds }: { pairs: Pair[]; kinds: Kind[] }) {
  const [state, action, pending] = useActionState<AlertActionState, FormData>(createAlertAction, undefined);
  const [kind, setKind] = useState<Kind>(kinds[0]);
  const [pairIdx, setPairIdx] = useState(0);
  const pair = pairs[pairIdx];
  const needsPair = kind === 'price' || kind === 'spread' || kind === 'liquidity';
  const needsSide = kind === 'price' || kind === 'liquidity';
  const needsScope = kind === 'multi_ad_opportunity';

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1.5 text-xs ${kind === k ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'}`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {needsPair && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted">Par</span>
            <select
              value={pairIdx}
              onChange={(e) => setPairIdx(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
            >
              {pairs.map((p, i) => (
                <option key={`${p.asset}-${p.fiat}`} value={i}>
                  {p.asset}/{p.fiat}
                </option>
              ))}
            </select>
            <input type="hidden" name="asset" value={pair?.asset ?? 'USDT'} />
            <input type="hidden" name="fiat" value={pair?.fiat ?? ''} />
          </label>
        )}
        {needsSide && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted">Lado</span>
            <select name="side" className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent">
              <option value="sell">Venda</option>
              <option value="buy">Compra</option>
            </select>
          </label>
        )}
        {needsScope && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted">Âmbito</span>
            <select name="scope" className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent">
              <option value="any">Orçamento configurado</option>
              <option value="favorites">Só favoritos</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">Condição</span>
          <select name="operator" className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent">
            <option value="gte">≥ maior ou igual a</option>
            <option value="lte">≤ menor ou igual a</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">
            {kind === 'price' && `Valor (${pair?.fiat ?? '-'})`}
            {kind === 'cycle' && 'Eficiência do ciclo (%)'}
            {kind === 'spread' && 'Spread (%)'}
            {kind === 'liquidity' && 'Nº de anúncios'}
            {kind === 'account_balance' && 'Saldo (MZN)'}
            {kind === 'account_change_pct' && 'Variação (%)'}
            {kind === 'multi_ad_opportunity' && 'Lucro líquido mínimo'}
          </span>
          <input
            name="threshold"
            type="number"
            step="any"
            required
            defaultValue={kind === 'price' ? (pair?.sellPrice?.toFixed(2) ?? '') : kind === 'cycle' || kind === 'multi_ad_opportunity' ? '0' : ''}
            className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
          />
        </label>
      </div>

      {kind === 'price' && pair && (
        <p className="text-xs text-muted">
          Preço atual: compra {pair.buyPrice?.toFixed(2) ?? '-'} · venda {pair.sellPrice?.toFixed(2) ?? '-'} {pair.fiat}
        </p>
      )}
      {kind === 'cycle' && (
        <p className="text-xs text-muted">0% = avisa assim que ida e volta (MZN→USDT→ZAR→USDT→MZN) deixar de dar prejuízo - uma janela real de arbitragem.</p>
      )}
      {kind === 'account_change_pct' && <p className="text-xs text-muted">Compara com a leitura anterior (cada corrida da sincronização de mercado, ~10 min).</p>}
      {kind === 'multi_ad_opportunity' && (
        <p className="text-xs text-muted">
          Testa o valor de referência configurado em Configurações contra anúncios reais que não cobram M-Pesa/e-Mola - restrito
          aos teus favoritos se escolhido - e avisa (com notificação no telemóvel) quando uma compra seguida de venda desse valor
          der um lucro líquido real acima do indicado. Avaliado a cada corrida da sincronização de mercado.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60">
          {pending ? 'A criar...' : 'Criar alerta'}
        </button>
        {state?.error && <p className="text-sm text-negative">{state.error}</p>}
        {state?.success && <p className="text-sm text-positive">{state.success}</p>}
      </div>
    </form>
  );
}

export function AlertsPanel({ alerts, pairs, kinds }: { alerts: Alert[]; pairs: Pair[]; kinds: Kind[] }) {
  const relevant = alerts.filter((a) => kinds.includes(a.condition.kind));

  return (
    <div className="flex flex-col gap-4">
      <CreateAlertForm pairs={pairs} kinds={kinds} />

      {relevant.length === 0 ? (
        <p className="text-sm text-muted">Ainda sem alertas criados.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {relevant.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center gap-2">
                {a.active ? (
                  <span className={a.is_triggered ? 'text-accent' : 'text-muted'}>
                    <Bell size={15} />
                  </span>
                ) : (
                  <span className="text-muted">
                    <BellOff size={15} />
                  </span>
                )}
                <div>
                  <div className={a.active ? '' : 'text-muted line-through'}>{describeCondition(a.condition)}</div>
                  <div className="text-[11px] text-muted">
                    {a.is_triggered && a.active ? 'condição ativa agora' : a.last_triggered_at ? `último disparo: ${new Date(a.last_triggered_at).toLocaleString('pt-PT')}` : 'ainda não disparou'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <form action={toggleAlertAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="active" value={String(!a.active)} />
                  <button type="submit" className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground">
                    {a.active ? 'Desativar' : 'Ativar'}
                  </button>
                </form>
                <form action={deleteAlertAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="rounded-lg border border-border p-1.5 text-negative hover:bg-negative/10" aria-label="Eliminar alerta">
                    <Trash2 size={13} />
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
