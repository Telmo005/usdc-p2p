import { query } from '@/lib/db';
import { fetchSpotBalances, fetchFundingBalances, fetchEarnPositions } from '@/lib/binancePrivateClient';

export type WalletMovement = {
  id: string;
  type: 'deposit' | 'withdrawal' | 'adjustment';
  asset: string;
  amount: string;
  notes: string | null;
  created_at: string;
};

/** Manual log only - a personal record of transfers the Binance API can't
 *  see (moved to another exchange/wallet, etc). Never summed into the
 *  real balance below - see getRealWalletSnapshot. */
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
// figure. No fabricated exchange rate for anything else.
const STABLE_ASSETS = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'DAI']);

export type WalletBalance = { asset: string; quantity: number; usdEquivalent: number | null };
export type EarnBalance = {
  asset: string;
  principal: number;
  apr: number;
  cumulativeRewards: number;
  usdEquivalent: number | null;
  canRedeem: boolean;
};

export type WalletGroup = {
  id: 'spot' | 'funding';
  label: string;
  description: string;
  balances: WalletBalance[];
  totalUsd: number;
};

export type RealWalletSnapshot = {
  groups: WalletGroup[];
  earn: EarnBalance[];
  earnTotalUsd: number;
  totalUsd: number;
  totalMzn: number | null;
  totalZar: number | null;
  mznRate: number | null; // MZN per 1 USD(T), mid-market
  zarRate: number | null; // ZAR per 1 USD(T), mid-market
  fetchedAt: number;
};

function toBalances(raw: Array<{ asset: string; free: number; locked: number }>): WalletBalance[] {
  return raw
    .filter((b) => !b.asset.startsWith('LD')) // Earn's wrapped token - shown for real under `earn` instead
    .map((b) => {
      const quantity = b.free + b.locked;
      return { asset: b.asset, quantity, usdEquivalent: STABLE_ASSETS.has(b.asset) ? quantity : null };
    })
    .sort((a, b) => (b.usdEquivalent ?? 0) - (a.usdEquivalent ?? 0) || b.quantity - a.quantity);
}

/**
 * The real, live Binance balance across every wallet this key can read -
 * Spot, Funding, and Simple Earn Flexible - kept as separate, clearly
 * labeled groups rather than one flattened number, since they behave
 * differently (Funding is where completed P2P trades settle by default;
 * Earn principal isn't instantly liquid the way Spot/Funding are).
 * Nothing here is derived from synced orders or anything typed into this
 * app - order totals live in Ordens/Análise only, so the two can never
 * drift apart or double-count each other.
 */
export async function getRealWalletSnapshot(mznRate: number | null, zarRate: number | null): Promise<RealWalletSnapshot> {
  const [spotRaw, fundingRaw, earnRaw] = await Promise.all([fetchSpotBalances(), fetchFundingBalances(), fetchEarnPositions()]);

  const groups: WalletGroup[] = [
    {
      id: 'spot',
      label: 'Spot',
      description: 'Carteira de negociação - onde compras/vendes na Binance diretamente.',
      balances: toBalances(spotRaw),
      totalUsd: 0,
    },
    {
      id: 'funding',
      label: 'Funding',
      description: 'Onde a Binance liquida as tuas trocas P2P por predefinição.',
      balances: toBalances(fundingRaw),
      totalUsd: 0,
    },
  ];
  for (const g of groups) g.totalUsd = g.balances.reduce((sum, b) => sum + (b.usdEquivalent ?? 0), 0);

  const earn: EarnBalance[] = earnRaw
    .map((e) => ({
      asset: e.asset,
      principal: e.totalAmount,
      apr: e.latestApr,
      cumulativeRewards: e.cumulativeRewards,
      usdEquivalent: STABLE_ASSETS.has(e.asset) ? e.totalAmount : null,
      canRedeem: e.canRedeem,
    }))
    .sort((a, b) => (b.usdEquivalent ?? 0) - (a.usdEquivalent ?? 0));
  const earnTotalUsd = earn.reduce((sum, e) => sum + (e.usdEquivalent ?? 0), 0);

  const totalUsd = groups.reduce((sum, g) => sum + g.totalUsd, 0) + earnTotalUsd;

  return {
    groups,
    earn,
    earnTotalUsd,
    totalUsd,
    totalMzn: mznRate != null ? totalUsd * mznRate : null,
    totalZar: zarRate != null ? totalUsd * zarRate : null,
    mznRate,
    zarRate,
    fetchedAt: Date.now(),
  };
}
