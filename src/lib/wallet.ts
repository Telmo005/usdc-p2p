import { query } from '@/lib/db';
import { fetchSpotBalances } from '@/lib/binancePrivateClient';

export type WalletMovement = {
  id: string;
  type: 'deposit' | 'withdrawal' | 'adjustment';
  asset: string;
  amount: string;
  notes: string | null;
  created_at: string;
};

/** Manual log only - kept separate from the real balance below on purpose
 *  (see getRealBalances doc comment): a personal record of transfers the
 *  Binance API can't see, never summed into "saldo atual". */
export async function getWalletMovements(userId: string, asset?: string): Promise<WalletMovement[]> {
  if (asset) {
    return query<WalletMovement>(
      `select id, type, asset, amount, notes, created_at from p2p_manager.wallet_movements
       where user_id = $1 and asset = $2 order by created_at desc`,
      [userId, asset]
    );
  }
  return query<WalletMovement>(
    `select id, type, asset, amount, notes, created_at from p2p_manager.wallet_movements
     where user_id = $1 order by created_at desc`,
    [userId]
  );
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

// Assets pegged ~1:1 to USD - the only ones we convert to a USD-equivalent
// figure. "LD"-prefixed assets are Binance Simple Earn's wrapped/locked
// token for the underlying stablecoin (e.g. LDUSDT = staked USDT).
const STABLE_ASSETS = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'DAI', 'LDUSDT', 'LDUSDC', 'LDBUSD', 'LDFDUSD']);

export type RealBalance = { asset: string; quantity: number; usdEquivalent: number | null };

export type RealWalletSnapshot = {
  balances: RealBalance[];
  totalUsd: number;
  totalMzn: number | null;
  totalZar: number | null;
  mznRate: number | null; // MZN per 1 USD(T), mid-market
  zarRate: number | null; // ZAR per 1 USD(T), mid-market
};

/**
 * The real, live Binance Spot balance - a direct read from the account,
 * not derived from synced orders or anything typed into this app. Order
 * totals (how much was bought/sold) live in Ordens/Análise only; they
 * never feed into this number, by design, so the two can't drift or be
 * double-counted.
 */
export async function getRealWalletSnapshot(mznRate: number | null, zarRate: number | null): Promise<RealWalletSnapshot> {
  const raw = await fetchSpotBalances();
  const balances: RealBalance[] = raw
    .map((b) => {
      const quantity = b.free + b.locked;
      const usdEquivalent = STABLE_ASSETS.has(b.asset) ? quantity : null;
      return { asset: b.asset, quantity, usdEquivalent };
    })
    .sort((a, b) => (b.usdEquivalent ?? 0) - (a.usdEquivalent ?? 0));

  const totalUsd = balances.reduce((sum, b) => sum + (b.usdEquivalent ?? 0), 0);

  return {
    balances,
    totalUsd,
    totalMzn: mznRate != null ? totalUsd * mznRate : null,
    totalZar: zarRate != null ? totalUsd * zarRate : null,
    mznRate,
    zarRate,
  };
}
