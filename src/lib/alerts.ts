import { query } from '@/lib/db';
import { cycleEfficiencyPct } from '@/lib/profitCalculator';
import { sendPush } from '@/lib/messagingClient';
import { describeCondition } from '@/lib/alertDescriptions';

export type AlertCondition =
  | { kind: 'price'; asset: string; fiat: string; side: 'buy' | 'sell'; operator: 'gte' | 'lte'; threshold: number }
  | { kind: 'cycle'; operator: 'gte' | 'lte'; threshold: number }
  | { kind: 'spread'; asset: string; fiat: string; operator: 'gte' | 'lte'; threshold: number }
  | { kind: 'liquidity'; asset: string; fiat: string; side: 'buy' | 'sell'; operator: 'gte' | 'lte'; threshold: number }
  | { kind: 'account_balance'; operator: 'gte' | 'lte'; threshold: number }
  | { kind: 'account_change_pct'; operator: 'gte' | 'lte'; threshold: number };

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

function unitFor(kind: AlertCondition['kind']): string {
  if (kind === 'liquidity') return ' anúncios';
  if (kind === 'account_balance') return ' MZN';
  if (kind === 'price') return ''; // fiat appended separately below
  return '%';
}

export type AlertMarketInput = {
  prices: Array<{ asset: string; fiat: string; side: 'buy' | 'sell'; price: number | null }>;
  spreads: Array<{ asset: string; fiat: string; spreadPct: number | null }>;
  liquidity: Array<{ asset: string; fiat: string; side: 'buy' | 'sell'; sampleSize: number | null }>;
  /** Real account_snapshots reads (Phase 5) - null when no snapshot exists
   *  yet (e.g. right after the table was created) or the wallet read failed
   *  on this tick; account_balance/account_change_pct alerts simply don't
   *  evaluate that tick rather than firing on a guessed value. */
  accountBalance: { current: number; previous: number | null } | null;
};

/**
 * Runs once per market-sync tick (called from
 * api/cron/market-sync/route.ts, which assembles all four data sources
 * after both runMarketSync() and recordAccountSnapshot() have completed)
 * against every active alert, across every user - real data in, real
 * notifications out, nothing simulated. Edge-triggered: a condition only
 * fires once when it becomes true (is_triggered flips to true), and resets
 * once it stops being true, so a value sitting past a threshold for hours
 * doesn't spam a notification every single tick.
 */
export async function evaluateAlerts(input: AlertMarketInput): Promise<void> {
  const priceMap = new Map<string, number>();
  for (const p of input.prices) if (p.price != null) priceMap.set(`${p.asset}/${p.fiat}/${p.side}`, p.price);

  const spreadMap = new Map<string, number>();
  for (const s of input.spreads) if (s.spreadPct != null) spreadMap.set(`${s.asset}/${s.fiat}`, s.spreadPct);

  const liquidityMap = new Map<string, number>();
  for (const l of input.liquidity) if (l.sampleSize != null) liquidityMap.set(`${l.asset}/${l.fiat}/${l.side}`, l.sampleSize);

  const mznBuy = priceMap.get('USDT/MZN/buy');
  const mznSell = priceMap.get('USDT/MZN/sell');
  const zarBuy = priceMap.get('USDT/ZAR/buy');
  const zarSell = priceMap.get('USDT/ZAR/sell');
  const cyclePct =
    mznBuy != null && mznSell != null && zarBuy != null && zarSell != null
      ? cycleEfficiencyPct({ fiatABuy: mznBuy, fiatASell: mznSell, fiatBBuy: zarBuy, fiatBSell: zarSell })
      : null;

  const accountChangePct =
    input.accountBalance?.previous != null && input.accountBalance.previous > 0
      ? ((input.accountBalance.current - input.accountBalance.previous) / input.accountBalance.previous) * 100
      : null;

  const alerts = await query<{ id: string; user_id: string; condition: AlertCondition; is_triggered: boolean }>(
    `select id, user_id, condition, is_triggered from p2p_manager.alerts where active = true`
  );

  for (const alert of alerts) {
    const c = alert.condition;
    let currentValue: number | null;
    switch (c.kind) {
      case 'price':
        currentValue = priceMap.get(`${c.asset}/${c.fiat}/${c.side}`) ?? null;
        break;
      case 'cycle':
        currentValue = cyclePct;
        break;
      case 'spread':
        currentValue = spreadMap.get(`${c.asset}/${c.fiat}`) ?? null;
        break;
      case 'liquidity':
        currentValue = liquidityMap.get(`${c.asset}/${c.fiat}/${c.side}`) ?? null;
        break;
      case 'account_balance':
        currentValue = input.accountBalance?.current ?? null;
        break;
      case 'account_change_pct':
        currentValue = accountChangePct;
        break;
    }
    if (currentValue == null) continue;

    const met = c.operator === 'gte' ? currentValue >= c.threshold : currentValue <= c.threshold;

    if (met && !alert.is_triggered) {
      const desc = describeCondition(c);
      const valueSuffix = c.kind === 'price' ? ` ${c.fiat}` : unitFor(c.kind);
      const title = `Alerta: ${desc}`;
      const body = `Valor atual: ${currentValue.toFixed(2)}${valueSuffix}.`;

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
