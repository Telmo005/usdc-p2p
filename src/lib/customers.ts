import { query } from '@/lib/db';

export type CustomerSummary = {
  id: string;
  nickname: string;
  firstSeenAt: string;
  lastSeenAt: string;
  orderCount: number;
  buyCount: number;
  sellCount: number;
  volumeByFiat: Array<{ fiat: string; totalValue: number }>;
};

/**
 * One row per real counterparty this user has actually traded with,
 * linked from synced orders (see api/sync/route.ts) - nothing invented.
 * Binance's C2C history only gives a nickname per counterparty, not a
 * stable id, so the nickname is the identity key (see counterparties
 * table). Volume stays broken out per fiat - summing MZN and ZAR
 * together would be meaningless.
 */
export async function getCustomerSummaries(userId: string): Promise<CustomerSummary[]> {
  const core = await query<{
    id: string;
    nickname: string;
    first_seen_at: string;
    last_seen_at: string;
    order_count: string;
    buy_count: string;
    sell_count: string;
  }>(
    `select c.id, c.nickname, c.first_seen_at, c.last_seen_at,
            count(o.id) filter (where o.status = 'completed') as order_count,
            count(o.id) filter (where o.status = 'completed' and o.side = 'buy') as buy_count,
            count(o.id) filter (where o.status = 'completed' and o.side = 'sell') as sell_count
     from p2p_manager.counterparties c
     left join p2p_manager.orders o on o.counterparty_id = c.id
     where c.user_id = $1
     group by c.id, c.nickname, c.first_seen_at, c.last_seen_at
     order by c.last_seen_at desc`,
    [userId]
  );

  const volumeRows = await query<{ counterparty_id: string; fiat: string; total: string }>(
    `select counterparty_id, fiat, sum(total_value) as total
     from p2p_manager.orders
     where user_id = $1 and status = 'completed' and counterparty_id is not null
     group by counterparty_id, fiat`,
    [userId]
  );
  const volumeByCounterparty = new Map<string, Array<{ fiat: string; totalValue: number }>>();
  for (const row of volumeRows) {
    if (!volumeByCounterparty.has(row.counterparty_id)) volumeByCounterparty.set(row.counterparty_id, []);
    volumeByCounterparty.get(row.counterparty_id)!.push({ fiat: row.fiat, totalValue: Number(row.total) });
  }

  return core.map((c) => ({
    id: c.id,
    nickname: c.nickname,
    firstSeenAt: c.first_seen_at,
    lastSeenAt: c.last_seen_at,
    orderCount: Number(c.order_count),
    buyCount: Number(c.buy_count),
    sellCount: Number(c.sell_count),
    volumeByFiat: (volumeByCounterparty.get(c.id) ?? []).sort((a, b) => b.totalValue - a.totalValue),
  }));
}

export type CustomerDetail = CustomerSummary & {
  orders: Array<{
    id: string;
    side: string;
    asset: string;
    fiat: string;
    quantity: string;
    price: string;
    total_value: string;
    status: string;
    created_at: string;
  }>;
};

/**
 * Nickname -> counterparty id, for every real counterparty this user has
 * ever traded with. Binance's public P2P ad book only gives a nickname per
 * advertiser (no stable public id) - this lets the Anúncios page honestly
 * say "já negociaste com este comerciante" when (and only when) a live ad's
 * nickname matches someone from real, synced trade history.
 */
export async function getCounterpartyNicknameMap(userId: string): Promise<Record<string, string>> {
  const rows = await query<{ id: string; nickname: string }>(`select id, nickname from p2p_manager.counterparties where user_id = $1`, [userId]);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.nickname] = r.id;
  return map;
}

export async function getCustomerDetail(userId: string, counterpartyId: string): Promise<CustomerDetail | null> {
  const summaries = await getCustomerSummaries(userId);
  const summary = summaries.find((c) => c.id === counterpartyId);
  if (!summary) return null;

  const orders = await query<CustomerDetail['orders'][number]>(
    `select id, side, asset, fiat, quantity, price, total_value, status, created_at
     from p2p_manager.orders
     where user_id = $1 and counterparty_id = $2
     order by created_at desc`,
    [userId, counterpartyId]
  );

  return { ...summary, orders };
}
