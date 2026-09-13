/**
 * Pure P2P buy/sell profit math - no DB, no I/O. Every function here works
 * on one trade: buy `quantity` at `buyPrice`, sell it at `sellPrice`, with
 * optional flat fees (fiat) on each leg.
 *
 *   cost      = quantity * buyPrice + buyFee
 *   proceeds  = quantity * sellPrice - sellFee
 *   profit    = proceeds - cost
 *   profitPct = profit / cost * 100
 *
 * Every "solve for X" function below is that same equation rearranged -
 * covers every direction someone might want to plan a trade from.
 */

export type ProfitResult = { cost: number; proceeds: number; profit: number; profitPct: number };

export function computeProfit(args: { quantity: number; buyPrice: number; sellPrice: number; buyFee?: number; sellFee?: number }): ProfitResult {
  const { quantity, buyPrice, sellPrice, buyFee = 0, sellFee = 0 } = args;
  const cost = quantity * buyPrice + buyFee;
  const proceeds = quantity * sellPrice - sellFee;
  const profit = proceeds - cost;
  const profitPct = cost > 0 ? (profit / cost) * 100 : 0;
  return { cost, proceeds, profit, profitPct };
}

/** You already bought at `buyPrice`. What sell price hits `minProfitPct`? */
export function requiredSellPrice(args: { quantity: number; buyPrice: number; buyFee?: number; sellFee?: number; minProfitPct: number }): number | null {
  const { quantity, buyPrice, buyFee = 0, sellFee = 0, minProfitPct } = args;
  if (quantity <= 0) return null;
  const cost = quantity * buyPrice + buyFee;
  const neededProceeds = cost * (1 + minProfitPct / 100);
  return (neededProceeds + sellFee) / quantity;
}

/**
 * You expect to sell at `sellPrice`. What's the highest AVERAGE price you
 * can pay when buying - across one ad or several at different prices - and
 * still hit `minProfitPct`? Buy under this ceiling (on average) and the
 * profit target survives no matter how many lots it took to fill the order.
 */
export function maxBuyPrice(args: { quantity: number; sellPrice: number; sellFee?: number; buyFee?: number; minProfitPct: number }): number | null {
  const { quantity, sellPrice, sellFee = 0, buyFee = 0, minProfitPct } = args;
  if (quantity <= 0) return null;
  const proceeds = quantity * sellPrice - sellFee;
  const maxCost = proceeds / (1 + minProfitPct / 100);
  return (maxCost - buyFee) / quantity;
}

/** You know both prices. How much do you need to trade to walk away with
 *  a fixed profit AMOUNT (not a percentage)? */
export function requiredQuantityForProfitAmount(args: {
  buyPrice: number;
  sellPrice: number;
  buyFee?: number;
  sellFee?: number;
  targetProfit: number;
}): number | null {
  const { buyPrice, sellPrice, buyFee = 0, sellFee = 0, targetProfit } = args;
  const marginPerUnit = sellPrice - buyPrice;
  if (marginPerUnit <= 0) return null;
  const qty = (targetProfit + buyFee + sellFee) / marginPerUnit;
  return qty > 0 ? qty : null;
}
