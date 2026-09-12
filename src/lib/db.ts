import { Pool, type QueryResultRow } from 'pg';

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

/** Every KPI the Dashboard needs, in one round trip - all scoped to `userId`. */
export async function getDashboardSummary(userId: string) {
  const [totals] = await query<{
    total_buy: string | null;
    total_sell: string | null;
    completed_count: string;
    pending_count: string;
  }>(
    `select
       coalesce(sum(total_value) filter (where side = 'buy' and status = 'completed'), 0) as total_buy,
       coalesce(sum(total_value) filter (where side = 'sell' and status = 'completed'), 0) as total_sell,
       count(*) filter (where status = 'completed') as completed_count,
       count(*) filter (where status not in ('completed', 'cancelled', 'expired')) as pending_count
     from p2p_manager.orders
     where user_id = $1`,
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

  const totalBuy = Number(totals?.total_buy ?? 0);
  const totalSell = Number(totals?.total_sell ?? 0);

  return {
    totalBuy,
    totalSell,
    grossProfit: totalSell - totalBuy,
    completedCount: Number(totals?.completed_count ?? 0),
    pendingCount: Number(totals?.pending_count ?? 0),
    recentOrders,
    attentionOrders,
    lastSync: lastSync ?? null,
  };
}

export type MarketPoint = { t: string; price: number };
export type MarketSeries = {
  asset: string;
  fiat: string;
  buy: { points: MarketPoint[]; trend: 'up' | 'down' | null; lastPrice: number | null };
  sell: { points: MarketPoint[]; trend: 'up' | 'down' | null; lastPrice: number | null };
};

/**
 * Real Binance P2P price history for every tracked pair, for the market
 * chart on the Dashboard - fed by the market-sync cron (lib/marketAnalysis.ts).
 * Not user-scoped: this is shared market data, same for every user.
 */
export async function getMarketSeries(hours = 48): Promise<MarketSeries[]> {
  // avg_top_price (mean of the 5 best ads), not best_price - see the same
  // note in lib/marketAnalysis.ts on why a single top ad is too noisy to
  // chart or feed into trend detection on its own.
  const snapshots = await query<{ asset: string; fiat: string; side: 'buy' | 'sell'; avg_top_price: string; created_at: string }>(
    `select asset, fiat, side, avg_top_price, created_at
     from p2p_manager.market_snapshots
     where platform = 'binance' and created_at > now() - ($1 || ' hours')::interval
     order by created_at asc`,
    [hours]
  );

  const trendRows = await query<{ asset: string; fiat: string; side: 'buy' | 'sell'; trend: 'up' | 'down' | null }>(
    `select asset, fiat, side, trend from p2p_manager.market_trend_state where platform = 'binance'`
  );

  const pairs = new Map<string, MarketSeries>();
  const key = (asset: string, fiat: string) => `${asset}/${fiat}`;

  for (const row of snapshots) {
    const k = key(row.asset, row.fiat);
    if (!pairs.has(k)) {
      pairs.set(k, {
        asset: row.asset,
        fiat: row.fiat,
        buy: { points: [], trend: null, lastPrice: null },
        sell: { points: [], trend: null, lastPrice: null },
      });
    }
    const series = pairs.get(k)!;
    const point = { t: row.created_at, price: Number(row.avg_top_price) };
    series[row.side].points.push(point);
    series[row.side].lastPrice = point.price;
  }

  for (const row of trendRows) {
    const series = pairs.get(key(row.asset, row.fiat));
    if (series) series[row.side].trend = row.trend;
  }

  return [...pairs.values()];
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
export async function getProfile(userId: string, fallbackEmail?: string | null) {
  const [profile] = await query<{ id: string; full_name: string | null; role: string; reference_currency: string }>(
    `select id, full_name, role, reference_currency from p2p_manager.profiles where id = $1`,
    [userId]
  );
  if (profile) return profile;

  const [created] = await query<{ id: string; full_name: string | null; role: string; reference_currency: string }>(
    `insert into p2p_manager.profiles (id, full_name)
     values ($1, $2)
     on conflict (id) do update set id = excluded.id
     returning id, full_name, role, reference_currency`,
    [userId, fallbackEmail ?? null]
  );
  return created ?? null;
}
