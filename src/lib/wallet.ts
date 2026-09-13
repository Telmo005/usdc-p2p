import { query } from '@/lib/db';

export type WalletMovement = {
  id: string;
  type: 'deposit' | 'withdrawal' | 'adjustment';
  asset: string;
  amount: string;
  notes: string | null;
  created_at: string;
};

export async function getWalletMovements(userId: string, asset = 'USDT'): Promise<WalletMovement[]> {
  return query<WalletMovement>(
    `select id, type, asset, amount, notes, created_at
     from p2p_manager.wallet_movements
     where user_id = $1 and asset = $2
     order by created_at desc`,
    [userId, asset]
  );
}

export type CapitalPoint = { t: number; balance: number; label: string; delta: number };

export type WalletSummary = {
  asset: string;
  currentBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  netAdjustments: number;
  tradingProfitByFiat: Array<{ fiat: string; totalBuy: number; totalSell: number; profit: number }>;
  evolution: CapitalPoint[];
};

/**
 * Real custody balance for `asset` (default USDT): every completed order
 * moves it (buy = received, sell = given away), every manually registered
 * deposit/withdrawal/adjustment moves it too - there is no other source,
 * so this is exactly the running sum of those two real event streams, not
 * a synced exchange balance (the read-only API key this app uses has no
 * wallet-balance endpoint, by design - see the Binance API key note in
 * settings/README).
 */
export async function getWalletSummary(userId: string, asset = 'USDT'): Promise<WalletSummary> {
  const orders = await query<{ side: 'buy' | 'sell'; quantity: string; fiat: string; total_value: string; created_at: string }>(
    `select side, quantity, fiat, total_value, created_at
     from p2p_manager.orders
     where user_id = $1 and asset = $2 and status = 'completed'
     order by created_at asc`,
    [userId, asset]
  );

  const movements = await query<{ type: string; amount: string; created_at: string }>(
    `select type, amount, created_at from p2p_manager.wallet_movements
     where user_id = $1 and asset = $2
     order by created_at asc`,
    [userId, asset]
  );

  type Event = { t: number; delta: number; label: string };
  const events: Event[] = orders.map((o) => {
    const qty = Number(o.quantity);
    return { t: new Date(o.created_at).getTime(), delta: o.side === 'buy' ? qty : -qty, label: o.side === 'buy' ? 'Compra' : 'Venda' };
  });

  let totalDeposited = 0;
  let totalWithdrawn = 0;
  let netAdjustments = 0;
  for (const m of movements) {
    const amt = Number(m.amount);
    const label = m.type === 'deposit' ? 'Depósito' : m.type === 'withdrawal' ? 'Levantamento' : 'Ajuste';
    const delta = m.type === 'withdrawal' ? -Math.abs(amt) : amt;
    events.push({ t: new Date(m.created_at).getTime(), delta, label });
    if (m.type === 'deposit') totalDeposited += amt;
    else if (m.type === 'withdrawal') totalWithdrawn += Math.abs(amt);
    else netAdjustments += amt;
  }

  events.sort((a, b) => a.t - b.t);

  let running = 0;
  const evolution: CapitalPoint[] = events.map((e) => {
    running += e.delta;
    return { t: e.t, balance: running, label: e.label, delta: e.delta };
  });

  const byFiat = new Map<string, { totalBuy: number; totalSell: number }>();
  for (const o of orders) {
    if (!byFiat.has(o.fiat)) byFiat.set(o.fiat, { totalBuy: 0, totalSell: 0 });
    const entry = byFiat.get(o.fiat)!;
    if (o.side === 'buy') entry.totalBuy += Number(o.total_value);
    else entry.totalSell += Number(o.total_value);
  }

  const tradingProfitByFiat = [...byFiat.entries()].map(([fiat, v]) => ({
    fiat,
    totalBuy: v.totalBuy,
    totalSell: v.totalSell,
    profit: v.totalSell - v.totalBuy,
  }));

  return { asset, currentBalance: running, totalDeposited, totalWithdrawn, netAdjustments, tradingProfitByFiat, evolution };
}

export async function createWalletMovement(
  userId: string,
  args: { type: 'deposit' | 'withdrawal' | 'adjustment'; asset: string; amount: number; notes: string | null }
): Promise<void> {
  await query(
    `insert into p2p_manager.wallet_movements (user_id, type, asset, amount, notes) values ($1, $2, $3, $4, $5)`,
    [userId, args.type, args.asset, args.amount, args.notes]
  );
}
