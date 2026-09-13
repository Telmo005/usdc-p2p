import { query } from '@/lib/db';
import { cycleEfficiencyPct } from '@/lib/profitCalculator';
import { sendPush } from '@/lib/messagingClient';

export type AlertCondition =
  | { kind: 'price'; asset: string; fiat: string; side: 'buy' | 'sell'; operator: 'gte' | 'lte'; threshold: number }
  | { kind: 'cycle'; operator: 'gte' | 'lte'; threshold: number };

export type Alert = {
  id: string;
  type: string;
  condition: AlertCondition;
  active: boolean;
  is_triggered: boolean;
  last_triggered_at: string | null;
  created_at: string;
};

export async function getUserAlerts(userId: string): Promise<Alert[]> {
  return query<Alert>(
    `select id, type, condition, active, is_triggered, last_triggered_at, created_at
     from p2p_manager.alerts where user_id = $1 order by created_at desc`,
    [userId]
  );
}

export async function createAlert(userId: string, condition: AlertCondition): Promise<void> {
  await query(`insert into p2p_manager.alerts (user_id, type, condition) values ($1, $2, $3)`, [userId, condition.kind, JSON.stringify(condition)]);
}

export async function setAlertActive(userId: string, id: string, active: boolean): Promise<void> {
  await query(`update p2p_manager.alerts set active = $3, is_triggered = false where id = $1 and user_id = $2`, [id, userId, active]);
}

export async function deleteAlert(userId: string, id: string): Promise<void> {
  await query(`delete from p2p_manager.alerts where id = $1 and user_id = $2`, [id, userId]);
}

function describeCondition(c: AlertCondition): string {
  const cmp = c.operator === 'gte' ? '≥' : '≤';
  if (c.kind === 'price') return `${c.asset}/${c.fiat} (${c.side === 'buy' ? 'compra' : 'venda'}) ${cmp} ${c.threshold}`;
  return `Ciclo MZN⇄ZAR ${cmp} ${c.threshold}%`;
}

/**
 * Runs after every market-sync tick (see marketAnalysis.ts) against every
 * active alert, across every user - real prices in, real notifications
 * out, nothing simulated. Edge-triggered: a condition only fires once when
 * it becomes true (is_triggered flips to true), and resets once it stops
 * being true, so a price sitting above a threshold for hours doesn't spam
 * a notification every single tick.
 */
export async function evaluateAlerts(prices: Array<{ asset: string; fiat: string; side: 'buy' | 'sell'; price: number | null }>): Promise<void> {
  const priceMap = new Map<string, number>();
  for (const p of prices) {
    if (p.price != null) priceMap.set(`${p.asset}/${p.fiat}/${p.side}`, p.price);
  }

  const mznBuy = priceMap.get('USDT/MZN/buy');
  const mznSell = priceMap.get('USDT/MZN/sell');
  const zarBuy = priceMap.get('USDT/ZAR/buy');
  const zarSell = priceMap.get('USDT/ZAR/sell');
  const cyclePct =
    mznBuy != null && mznSell != null && zarBuy != null && zarSell != null
      ? cycleEfficiencyPct({ fiatABuy: mznBuy, fiatASell: mznSell, fiatBBuy: zarBuy, fiatBSell: zarSell })
      : null;

  const alerts = await query<{ id: string; user_id: string; condition: AlertCondition; is_triggered: boolean }>(
    `select id, user_id, condition, is_triggered from p2p_manager.alerts where active = true`
  );

  for (const alert of alerts) {
    const c = alert.condition;
    const currentValue = c.kind === 'price' ? (priceMap.get(`${c.asset}/${c.fiat}/${c.side}`) ?? null) : cyclePct;
    if (currentValue == null) continue;

    const met = c.operator === 'gte' ? currentValue >= c.threshold : currentValue <= c.threshold;

    if (met && !alert.is_triggered) {
      const desc = describeCondition(c);
      const title = c.kind === 'price' ? `Alerta: ${c.asset}/${c.fiat} ${c.side === 'buy' ? 'compra' : 'venda'} atingiu ${currentValue.toFixed(2)}` : `Alerta: ciclo MZN⇄ZAR em ${currentValue.toFixed(2)}%`;
      const body = `Condição: ${desc}. Valor atual: ${currentValue.toFixed(2)}${c.kind === 'cycle' ? '%' : ` ${c.fiat}`}.`;

      await query(`insert into p2p_manager.notifications (user_id, type, title, body) values ($1, 'custom_alert', $2, $3)`, [alert.user_id, title, body]);
      await sendPush(title, body);
      await query(`update p2p_manager.alerts set is_triggered = true, last_triggered_at = now() where id = $1`, [alert.id]);
      await query(
        `insert into p2p_manager.audit_log (user_id, action, entity_type, entity_id, after) values ($1, 'alert_triggered', 'alerts', $2, $3)`,
        [alert.user_id, alert.id, JSON.stringify({ currentValue, condition: c })]
      );
    } else if (!met && alert.is_triggered) {
      await query(`update p2p_manager.alerts set is_triggered = false where id = $1`, [alert.id]);
    }
  }
}
