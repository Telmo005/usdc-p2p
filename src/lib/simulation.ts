import { query, withTransaction } from '@/lib/db';

export type SimLot = {
  id: string;
  asset: string;
  fiat: string;
  quantity: string;
  quantity_remaining: string;
  buy_price: string;
  buy_fee: string;
  notes: string | null;
  status: 'open' | 'closed';
  created_at: string;
};

export type SimSale = {
  id: string;
  lot_id: string;
  quantity: string;
  sell_price: string;
  sell_fee: string;
  realized_profit: string;
  created_at: string;
  asset: string;
  fiat: string;
};

export async function getOpenLots(userId: string): Promise<SimLot[]> {
  return query<SimLot>(
    `select id, asset, fiat, quantity, quantity_remaining, buy_price, buy_fee, notes, status, created_at
     from p2p_manager.sim_lots
     where user_id = $1 and status = 'open'
     order by created_at asc`,
    [userId]
  );
}

export async function getRecentSales(userId: string, limit = 20): Promise<SimSale[]> {
  return query<SimSale>(
    `select s.id, s.lot_id, s.quantity, s.sell_price, s.sell_fee, s.realized_profit, s.created_at, l.asset, l.fiat
     from p2p_manager.sim_sales s
     join p2p_manager.sim_lots l on l.id = s.lot_id
     where s.user_id = $1
     order by s.created_at desc
     limit $2`,
    [userId, limit]
  );
}

export type PositionSummary = {
  asset: string;
  fiat: string;
  quantityOpen: number;
  avgCost: number;
  totalCostBasis: number;
};

/** One row per (asset, fiat) with an open position: total quantity still
 *  held and the cost-weighted average price paid across every open lot. */
export async function getPositionSummaries(userId: string): Promise<PositionSummary[]> {
  const rows = await query<{ asset: string; fiat: string; qty: string; cost_basis: string }>(
    `select asset, fiat,
            sum(quantity_remaining) as qty,
            sum(quantity_remaining * buy_price + buy_fee * (quantity_remaining / nullif(quantity, 0))) as cost_basis
     from p2p_manager.sim_lots
     where user_id = $1 and status = 'open'
     group by asset, fiat
     having sum(quantity_remaining) > 0`,
    [userId]
  );
  return rows.map((r) => {
    const quantityOpen = Number(r.qty);
    const totalCostBasis = Number(r.cost_basis);
    return { asset: r.asset, fiat: r.fiat, quantityOpen, totalCostBasis, avgCost: quantityOpen > 0 ? totalCostBasis / quantityOpen : 0 };
  });
}

export async function createLot(
  userId: string,
  args: { asset: string; fiat: string; quantity: number; buyPrice: number; buyFee: number; notes: string | null }
): Promise<void> {
  await query(
    `insert into p2p_manager.sim_lots (user_id, asset, fiat, quantity, quantity_remaining, buy_price, buy_fee, notes)
     values ($1, $2, $3, $4, $4, $5, $6, $7)`,
    [userId, args.asset, args.fiat, args.quantity, args.buyPrice, args.buyFee, args.notes]
  );
}

export class InsufficientQuantityError extends Error {
  constructor(available: number, requested: number) {
    super(`Só tens ${available} em aberto, pediste para vender ${requested}.`);
    this.name = 'InsufficientQuantityError';
  }
}

/**
 * Sells `quantity` of (asset, fiat) FIFO across the user's open lots -
 * oldest purchase consumed first, the standard convention when you don't
 * track which physical unit came from which lot. Fees are allocated
 * proportionally to how much of each lot a sale consumes. Runs as one
 * transaction: either every lot touched is updated and every sim_sales row
 * inserted, or none of it is.
 */
export async function recordSale(
  userId: string,
  args: { asset: string; fiat: string; quantity: number; sellPrice: number; sellFee: number }
): Promise<{ realizedProfit: number; lotsTouched: number }> {
  return withTransaction(async (client) => {
    const { rows: lots } = await client.query<{ id: string; quantity: string; quantity_remaining: string; buy_price: string; buy_fee: string }>(
      `select id, quantity, quantity_remaining, buy_price, buy_fee
       from p2p_manager.sim_lots
       where user_id = $1 and asset = $2 and fiat = $3 and status = 'open'
       order by created_at asc
       for update`,
      [userId, args.asset, args.fiat]
    );

    const totalAvailable = lots.reduce((sum, l) => sum + Number(l.quantity_remaining), 0);
    if (args.quantity > totalAvailable + 1e-9) {
      throw new InsufficientQuantityError(totalAvailable, args.quantity);
    }

    let remainingToSell = args.quantity;
    let realizedProfit = 0;
    let lotsTouched = 0;

    for (const lot of lots) {
      if (remainingToSell <= 1e-9) break;
      const lotRemaining = Number(lot.quantity_remaining);
      const lotOriginal = Number(lot.quantity);
      const lotBuyPrice = Number(lot.buy_price);
      const lotBuyFee = Number(lot.buy_fee);
      const portion = Math.min(lotRemaining, remainingToSell);
      const shareOfSale = portion / args.quantity;
      const shareOfLot = lotOriginal > 0 ? portion / lotOriginal : 0;

      const costPortion = portion * lotBuyPrice + lotBuyFee * shareOfLot;
      const sellFeePortion = args.sellFee * shareOfSale;
      const proceedsPortion = portion * args.sellPrice - sellFeePortion;
      const profitPortion = proceedsPortion - costPortion;

      const newRemaining = lotRemaining - portion;
      await client.query(
        `update p2p_manager.sim_lots set quantity_remaining = $2, status = case when $2 <= 0.00000001 then 'closed' else 'open' end
         where id = $1`,
        [lot.id, newRemaining]
      );
      await client.query(
        `insert into p2p_manager.sim_sales (user_id, lot_id, quantity, sell_price, sell_fee, realized_profit)
         values ($1, $2, $3, $4, $5, $6)`,
        [userId, lot.id, portion, args.sellPrice, sellFeePortion, profitPortion]
      );

      realizedProfit += profitPortion;
      lotsTouched += 1;
      remainingToSell -= portion;
    }

    return { realizedProfit, lotsTouched };
  });
}
