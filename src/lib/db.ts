import { Pool, type PoolClient, type QueryResultRow } from 'pg';

/**
 * Direct Postgres access to the `p2p_manager` schema. This app talks to
 * Postgres straight via DATABASE_URL rather than through Supabase's
 * PostgREST/`.from()` API, because `p2p_manager` isn't (and by design isn't)
 * in this shared project's exposed-schemas list - that setting is reserved
 * for the other real systems already living here (payments, p2p_arbitrage,
 * metical_edge), and this app was asked to stay completely isolated from
 * them.
 *
 * IMPORTANT: the role behind DATABASE_URL bypasses Row Level Security (it's
 * the pooler/admin-tier role, not `anon`/`authenticated`). RLS is still
 * enabled on every table as defense-in-depth, but it is NOT what protects
 * user data on this code path - every function below takes a `userId` and
 * filters by it explicitly. Never write a query here without that filter
 * (except the few functions explicitly marked admin-only).
 */

declare global {
  // eslint-disable-next-line no-var
  var __p2pManagerPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global.__p2pManagerPool) {
    global.__p2pManagerPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return global.__p2pManagerPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/** Checks out one connection and wraps `fn` in BEGIN/COMMIT (ROLLBACK on
 *  throw) - for multi-statement writes that must land atomically, like a
 *  sale that spans several lots (lib/simulation.ts). Regular reads/writes
 *  should keep using `query`, which lets the pool balance connections. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export type Order = {
  id: string;
  platform: string;
  external_order_id: string;
  side: 'buy' | 'sell';
  asset: string;
  fiat: string;
  quantity: string;
  price: string;
  total_value: string;
  fee: string;
  payment_method: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
};

export type OrderDetail = Order & {
  cancelled_at: string | null;
  counterparty_id: string | null;
  counterparty_nickname: string | null;
};

/** One order plus its counterparty's real nickname (if any) - for the
 *  order detail page. Scoped to `userId` like everything else here, so a
 *  bogus/other-user id resolves to null (page shows notFound()). */
export async function getOrderDetail(userId: string, id: string): Promise<OrderDetail | null> {
  const [row] = await query<OrderDetail>(
    `select o.id, o.platform, o.external_order_id, o.side, o.asset, o.fiat, o.quantity, o.price, o.total_value, o.fee,
            o.payment_method, o.status, o.created_at, o.completed_at, o.cancelled_at, o.counterparty_id,
            c.nickname as counterparty_nickname
     from p2p_manager.orders o
     left join p2p_manager.counterparties c on c.id = o.counterparty_id
     where o.user_id = $1 and o.id = $2`,
    [userId, id]
  );
  return row ?? null;
}

/** Every KPI the Dashboard needs, in one round trip - all scoped to `userId`.
 *  Deliberately does NOT return a cross-fiat buy/sell/profit total - MZN and
 *  ZAR orders can't be summed into one meaningful number (see
 *  `getAnalytics` in lib/analytics.ts, which does this correctly, per fiat,
 *  for Análise). This is current-state/operational data only; trading
 *  performance lives on Análise. */
export async function getDashboardSummary(userId: string) {
  const [totals] = await query<{ completed_count: string; pending_count: string }>(
    `select
       count(*) filter (where status = 'completed') as completed_count,
       count(*) filter (where status not in ('completed', 'cancelled', 'expired')) as pending_count
     from p2p_manager.orders
     where user_id = $1`,
    [userId]
  );

  const committedValueByFiat = await query<{ fiat: string; total: string }>(
    `select fiat, coalesce(sum(total_value), 0) as total
     from p2p_manager.orders
     where user_id = $1 and status not in ('completed', 'cancelled', 'expired')
     group by fiat`,
    [userId]
  );

  const recentOrders = await query<Order>(
    `select id, platform, external_order_id, side, asset, fiat, quantity, price, total_value, fee, payment_method, status, created_at, completed_at
     from p2p_manager.orders
     where user_id = $1
     order by created_at desc
     limit 8`,
    [userId]
  );

  const attentionOrders = await query<Order>(
    `select id, platform, external_order_id, side, asset, fiat, quantity, price, total_value, fee, payment_method, status, created_at, completed_at
     from p2p_manager.orders
     where user_id = $1 and status not in ('completed', 'cancelled', 'expired')
     order by created_at asc
     limit 5`,
    [userId]
  );

  const [lastSync] = await query<{ platform: string; last_synced_at: string | null; last_error: string | null }>(
    `select platform, last_synced_at, last_error from p2p_manager.sync_state where user_id = $1 and resource = 'orders' order by last_synced_at desc nulls last limit 1`,
    [userId]
  );

  return {
    completedCount: Number(totals?.completed_count ?? 0),
    pendingCount: Number(totals?.pending_count ?? 0),
    committedValueByFiat: committedValueByFiat.map((r) => ({ fiat: r.fiat, total: Number(r.total) })),
    recentOrders,
    attentionOrders,
    lastSync: lastSync ?? null,
  };
}

export type MarketTick = { t: number; buy: number | null; sell: number | null };
export type MarketReversal = { side: 'buy' | 'sell'; newTrend: 'up' | 'down'; fromPrice: number; toPrice: number; t: number };
export type MarketSeries = {
  asset: string;
  fiat: string;
  ticks: MarketTick[];
  reversals: MarketReversal[];
  buyTrend: 'up' | 'down' | null;
  sellTrend: 'up' | 'down' | null;
  lastBuy: number | null;
  lastSell: number | null;
  lastBuyDepth: number | null;
  lastSellDepth: number | null;
};

/**
 * Real Binance P2P price history for every tracked pair, for the market
 * chart on the Dashboard - fed by the market-sync cron (lib/marketAnalysis.ts).
 * Not user-scoped: this is shared market data, same for every user.
 *
 * Buy and sell snapshots for the same cron tick land a second or two apart
 * (see lib/marketAnalysis.ts), not at the exact same timestamp - bucketing
 * to the nearest minute merges them into one point per tick without relying
 * on both arrays having matching lengths/order (a single failed fetch on
 * one side must not misalign the rest of the series).
 */
export async function getMarketSeries(hours = 168): Promise<MarketSeries[]> {
  // avg_top_price (mean of the 5 best ads), not best_price - see the same
  // note in lib/marketAnalysis.ts on why a single top ad is too noisy to
  // chart or feed into trend detection on its own.
  const snapshots = await query<{ asset: string; fiat: string; side: 'buy' | 'sell'; avg_top_price: string; sample_size: number; created_at: string }>(
    `select asset, fiat, side, avg_top_price, sample_size, created_at
     from p2p_manager.market_snapshots
     where platform = 'binance' and created_at > now() - ($1 || ' hours')::interval
     order by created_at asc`,
    [hours]
  );

  const trendRows = await query<{ asset: string; fiat: string; side: 'buy' | 'sell'; trend: 'up' | 'down' | null }>(
    `select asset, fiat, side, trend from p2p_manager.market_trend_state where platform = 'binance'`
  );

  const reversalRows = await query<{ entity_id: string; created_at: string; after: MarketReversal & { asset: string; fiat: string } }>(
    `select entity_id, created_at, after from p2p_manager.audit_log
     where action = 'market_reversal' and created_at > now() - ($1 || ' hours')::interval
     order by created_at asc`,
    [hours]
  );

  const BUCKET_MS = 60_000;
  const key = (asset: string, fiat: string) => `${asset}/${fiat}`;
  const buckets = new Map<string, Map<number, MarketTick>>();
  const meta = new Map<
    string,
    { buyTrend: 'up' | 'down' | null; sellTrend: 'up' | 'down' | null; lastBuy: number | null; lastSell: number | null; lastBuyDepth: number | null; lastSellDepth: number | null }
  >();
  const reversals = new Map<string, MarketReversal[]>();

  for (const row of snapshots) {
    const k = key(row.asset, row.fiat);
    if (!buckets.has(k)) buckets.set(k, new Map());
    if (!meta.has(k)) meta.set(k, { buyTrend: null, sellTrend: null, lastBuy: null, lastSell: null, lastBuyDepth: null, lastSellDepth: null });

    const bucketT = Math.round(new Date(row.created_at).getTime() / BUCKET_MS) * BUCKET_MS;
    const series = buckets.get(k)!;
    if (!series.has(bucketT)) series.set(bucketT, { t: bucketT, buy: null, sell: null });
    const price = Number(row.avg_top_price);
    series.get(bucketT)![row.side] = price;

    const m = meta.get(k)!;
    if (row.side === 'buy') {
      m.lastBuy = price;
      m.lastBuyDepth = row.sample_size;
    } else {
      m.lastSell = price;
      m.lastSellDepth = row.sample_size;
    }
  }

  for (const row of trendRows) {
    const m = meta.get(key(row.asset, row.fiat));
    if (!m) continue;
    if (row.side === 'buy') m.buyTrend = row.trend;
    else m.sellTrend = row.trend;
  }

  for (const row of reversalRows) {
    const k = key(row.after.asset, row.after.fiat);
    if (!reversals.has(k)) reversals.set(k, []);
    reversals.get(k)!.push({
      side: row.after.side,
      newTrend: row.after.newTrend,
      fromPrice: row.after.fromPrice,
      toPrice: row.after.toPrice,
      t: new Date(row.created_at).getTime(),
    });
  }

  return [...buckets.keys()].map((k) => {
    const [asset, fiat] = k.split('/');
    const m = meta.get(k)!;
    return {
      asset,
      fiat,
      ticks: [...buckets.get(k)!.values()].sort((a, b) => a.t - b.t),
      reversals: reversals.get(k) ?? [],
      buyTrend: m.buyTrend,
      sellTrend: m.sellTrend,
      lastBuy: m.lastBuy,
      lastSell: m.lastSell,
      lastBuyDepth: m.lastBuyDepth,
      lastSellDepth: m.lastSellDepth,
    };
  });
}

/** Market data has no per-user sync_state row (market_snapshots is global,
 *  unlike orders) - freshness is just the newest snapshot's timestamp. */
export async function getMarketFreshness(): Promise<{ lastCheckedAt: string | null }> {
  const [row] = await query<{ last: string | null }>(`select max(created_at) as last from p2p_manager.market_snapshots`);
  return { lastCheckedAt: row?.last ?? null };
}

export type AccountValuePoint = { t: number; totalUsd: number; totalMzn: number | null; totalZar: number | null };

/**
 * Real account-value history from p2p_manager.account_snapshots (see
 * lib/wallet.ts's recordAccountSnapshot, written by the market-sync cron).
 * Global/shared, not user-scoped - one real Binance account. History only
 * exists from whenever that table started being written to - a short span
 * here means the feature is new, not that data is missing/broken.
 */
export async function getAccountSnapshots(days: number): Promise<AccountValuePoint[]> {
  const rows = await query<{ total_usd: string; total_mzn: string | null; total_zar: string | null; created_at: string }>(
    `select total_usd, total_mzn, total_zar, created_at
     from p2p_manager.account_snapshots
     where created_at > now() - ($1 || ' days')::interval
     order by created_at asc`,
    [days]
  );
  return rows.map((r) => ({
    t: new Date(r.created_at).getTime(),
    totalUsd: Number(r.total_usd),
    totalMzn: r.total_mzn != null ? Number(r.total_mzn) : null,
    totalZar: r.total_zar != null ? Number(r.total_zar) : null,
  }));
}

/** The `limit` most recent account snapshots, newest first - for the
 *  ACCOUNT alert types (Phase 9), which need "current vs. previous" rather
 *  than a time-windowed series. */
export async function getLatestAccountSnapshots(limit: number): Promise<AccountValuePoint[]> {
  const rows = await query<{ total_usd: string; total_mzn: string | null; total_zar: string | null; created_at: string }>(
    `select total_usd, total_mzn, total_zar, created_at
     from p2p_manager.account_snapshots
     order by created_at desc
     limit $1`,
    [limit]
  );
  return rows.map((r) => ({
    t: new Date(r.created_at).getTime(),
    totalUsd: Number(r.total_usd),
    totalMzn: r.total_mzn != null ? Number(r.total_mzn) : null,
    totalZar: r.total_zar != null ? Number(r.total_zar) : null,
  }));
}

export type ActivityItem =
  | { kind: 'order'; id: string; t: string; side: 'buy' | 'sell'; asset: string; quantity: string; status: string }
  | { kind: 'movement'; id: string; t: string; type: string; asset: string; amount: string }
  | { kind: 'notification'; id: string; t: string; title: string };

/**
 * Recent activity from every source this app genuinely tracks today: real
 * synced orders, the personal wallet-movements notebook, and notifications
 * (e.g. market-trend alerts from lib/marketAnalysis.ts). Deliberately not
 * the full spec timeline (ads observed, price ticks, syncs, errors...) -
 * this app doesn't log those as discrete events yet, and inventing entries
 * for them here would be exactly the kind of fabricated data this project
 * rules out. Three cheap queries merged in JS, not a SQL UNION - the row
 * shapes are too different to union cleanly.
 */
export async function getRecentActivity(userId: string, limit = 15): Promise<ActivityItem[]> {
  const [orders, movements, notifications] = await Promise.all([
    query<{ id: string; side: 'buy' | 'sell'; asset: string; quantity: string; status: string; created_at: string }>(
      `select id, side, asset, quantity, status, created_at from p2p_manager.orders
       where user_id = $1 order by created_at desc limit $2`,
      [userId, limit]
    ),
    query<{ id: string; type: string; asset: string; amount: string; created_at: string }>(
      `select id, type, asset, amount, created_at from p2p_manager.wallet_movements
       where user_id = $1 order by created_at desc limit $2`,
      [userId, limit]
    ),
    query<{ id: string; title: string; created_at: string }>(
      `select id, title, created_at from p2p_manager.notifications
       where user_id = $1 order by created_at desc limit $2`,
      [userId, limit]
    ),
  ]);

  const items: ActivityItem[] = [
    ...orders.map((o): ActivityItem => ({ kind: 'order', id: o.id, t: o.created_at, side: o.side, asset: o.asset, quantity: o.quantity, status: o.status })),
    ...movements.map((m): ActivityItem => ({ kind: 'movement', id: m.id, t: m.created_at, type: m.type, asset: m.asset, amount: m.amount })),
    ...notifications.map((n): ActivityItem => ({ kind: 'notification', id: n.id, t: n.created_at, title: n.title })),
  ];

  return items.sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime()).slice(0, limit);
}

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const [row] = await query<{ n: string }>(
    `select count(*) as n from p2p_manager.notifications where user_id = $1 and read_at is null`,
    [userId]
  );
  return Number(row?.n ?? 0);
}

export async function getUserNotifications(userId: string, limit = 20): Promise<AppNotification[]> {
  return query<AppNotification>(
    `select id, type, title, body, read_at, created_at
     from p2p_manager.notifications where user_id = $1
     order by created_at desc limit $2`,
    [userId, limit]
  );
}

/**
 * `auth.users` is shared with the other systems in this Supabase project -
 * someone can already exist there (created by payments/p2p_arbitrage/
 * metical_edge) without ever having gone through this app's own sign-up, so
 * the trigger that normally creates a `profiles` row on insert never fired
 * for them. Lazily create a default one on first access here instead of
 * leaving them stuck with a null profile.
 */
export type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  reference_currency: string;
  capital_reference_mode: 'real' | 'manual';
  capital_reference_amount: string;
  trade_fee_pct: string;
  conversion_cost_pct: string;
  external_cost_fixed: string;
  safety_margin_pct: string;
};

const PROFILE_COLUMNS = `id, full_name, role, reference_currency, capital_reference_mode, capital_reference_amount,
                          trade_fee_pct, conversion_cost_pct, external_cost_fixed, safety_margin_pct`;

export async function getProfile(userId: string, fallbackEmail?: string | null): Promise<Profile | null> {
  const [profile] = await query<Profile>(`select ${PROFILE_COLUMNS} from p2p_manager.profiles where id = $1`, [userId]);
  if (profile) return profile;

  const [created] = await query<Profile>(
    `insert into p2p_manager.profiles (id, full_name)
     values ($1, $2)
     on conflict (id) do update set id = excluded.id
     returning ${PROFILE_COLUMNS}`,
    [userId, fallbackEmail ?? null]
  );
  return created ?? null;
}
