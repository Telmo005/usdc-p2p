import type { AlertCondition } from '@/lib/alerts';

// Deliberately its own file, separate from lib/alerts.ts: that module pulls
// in lib/db.ts (the `pg` package, Node-only) - AlertsPanel.tsx is a client
// component and needs this description logic without dragging `pg` into
// the browser bundle. Keep this file free of any server-only import.
export function describeCondition(c: AlertCondition): string {
  const cmp = c.operator === 'gte' ? '≥' : '≤';
  switch (c.kind) {
    case 'price':
      return `${c.asset}/${c.fiat} (${c.side === 'buy' ? 'compra' : 'venda'}) ${cmp} ${c.threshold}`;
    case 'cycle':
      return `Ciclo MZN⇄ZAR ${cmp} ${c.threshold}%`;
    case 'spread':
      return `Spread ${c.asset}/${c.fiat} ${cmp} ${c.threshold}%`;
    case 'liquidity':
      return `Liquidez ${c.asset}/${c.fiat} (${c.side === 'buy' ? 'compra' : 'venda'}) ${cmp} ${c.threshold} anúncios`;
    case 'account_balance':
      return `Saldo total da conta ${cmp} ${c.threshold} MZN`;
    case 'account_change_pct':
      return `Variação do saldo total ${cmp} ${c.threshold}% face à leitura anterior`;
    case 'multi_ad_opportunity':
      return `Oportunidade multi-anúncio sem taxas (${c.scope === 'favorites' ? 'só favoritos' : 'orçamento configurado'}) - lucro líquido ${cmp} ${c.threshold}`;
  }
}
