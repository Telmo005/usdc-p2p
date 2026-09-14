import type { P2PAd } from '@/lib/binancePublicP2P';
import { estimateCosts, type CapitalSettings } from '@/lib/capitalSettings';
import { getMPesaWithdrawalFee } from '@/lib/mpesaFees';

/**
 * Every other simulator in this app (QuickSimulator, CurrencyCycle,
 * ProfitCalculator) prices a trade at one aggregate number (avg_top_price -
 * the mean of the 5 best ads). That's fine for a quick estimate, but for a
 * large enough amount no single advertiser can actually fill it - you have
 * to buy from several people, each at their own real price, limits, and
 * availability. This module walks the real ad list (already best-price-
 * first, per lib/binancePublicP2P.ts) and builds that real, multi-
 * advertiser execution plan instead of pretending one uniform price goes
 * all the way down.
 */

export type FillStep = {
  advNo: string;
  advertiserNickname: string;
  advertiserIsMerchant: boolean;
  price: number;
  quantity: number;
  fiatValue: number;
  /** From the source ad (lib/binancePublicP2P.ts) - true when this specific
   *  ad offers a real way to pay other than M-Pesa/e-Mola cash-out, so no
   *  withdrawal fee applies to this step at all (see mpesaFeeForSteps). */
  hasNonMobileMoneyMethod: boolean;
};

export type FillResult = {
  steps: FillStep[];
  filledFiat: number;
  filledQuantity: number;
  avgPrice: number | null;
};

/**
 * Greedily fills `targetFiat` from real ads, respecting each ad's own
 * min/max per-order limits and its real availableQuantity. An ad is
 * skipped if what's affordable from it (capped by the remaining target,
 * the ad's own max, and its real posted availability) falls below that
 * ad's own minimum - a real order that small genuinely cannot be placed on
 * it. Never invents liquidity beyond what's actually posted: if the whole
 * list is exhausted before the target is reached, `filledFiat` simply
 * comes back short of `targetFiat` - callers must show that honestly.
 */
export function fillByFiatAmount(ads: P2PAd[], targetFiat: number): FillResult {
  const steps: FillStep[] = [];
  let remaining = targetFiat;

  for (const ad of ads) {
    if (remaining <= 0) break;
    if (ad.price <= 0) continue;
    const adCapacityFiat = ad.availableQuantity * ad.price;
    const affordable = Math.min(remaining, ad.maxSingleTransAmount, adCapacityFiat);
    if (affordable < ad.minSingleTransAmount) continue;

    steps.push({
      advNo: ad.advNo,
      advertiserNickname: ad.advertiserNickname,
      advertiserIsMerchant: ad.advertiserIsMerchant,
      price: ad.price,
      quantity: affordable / ad.price,
      fiatValue: affordable,
      hasNonMobileMoneyMethod: ad.hasNonMobileMoneyMethod,
    });
    remaining -= affordable;
  }

  const filledFiat = steps.reduce((s, x) => s + x.fiatValue, 0);
  const filledQuantity = steps.reduce((s, x) => s + x.quantity, 0);
  return { steps, filledFiat, filledQuantity, avgPrice: filledQuantity > 0 ? filledFiat / filledQuantity : null };
}

/** Mirror of fillByFiatAmount, filling a target quantity instead - used for
 *  the sell leg, fed by exactly how much the buy leg actually acquired. */
export function fillByQuantity(ads: P2PAd[], targetQuantity: number): FillResult {
  const steps: FillStep[] = [];
  let remaining = targetQuantity;

  for (const ad of ads) {
    if (remaining <= 0) break;
    if (ad.price <= 0) continue;
    const affordableQty = Math.min(remaining, ad.availableQuantity, ad.maxSingleTransAmount / ad.price);
    const fiatValue = affordableQty * ad.price;
    if (fiatValue < ad.minSingleTransAmount) continue;

    steps.push({
      advNo: ad.advNo,
      advertiserNickname: ad.advertiserNickname,
      advertiserIsMerchant: ad.advertiserIsMerchant,
      price: ad.price,
      quantity: affordableQty,
      fiatValue,
      hasNonMobileMoneyMethod: ad.hasNonMobileMoneyMethod,
    });
    remaining -= affordableQty;
  }

  const filledQuantity = steps.reduce((s, x) => s + x.quantity, 0);
  const filledFiat = steps.reduce((s, x) => s + x.fiatValue, 0);
  return { steps, filledFiat, filledQuantity, avgPrice: filledQuantity > 0 ? filledFiat / filledQuantity : null };
}

export type RoundTripPlan = {
  buy: FillResult;
  sell: FillResult;
  targetFiat: number;
  /** Real quantity that completed both legs - capped by whichever side ran
   *  out of liquidity first. */
  soldQuantity: number;
  /** > 0 only in the rare case the sell-side book couldn't absorb
   *  everything the buy leg acquired - never silently dropped. */
  unsoldQuantity: number;
  costBasisForSold: number;
  proceedsFromSold: number;
  configuredCosts: number;
  mpesaFee: number;
  grossResult: number;
  netResult: number;
};

/** Each merchant charges their own real withdrawal fee for their own
 *  order - the tariff is tiered, so this is NOT the same as one fee on the
 *  combined total (splitting across N merchants means N separate real
 *  cash withdrawals, each falling into its own bracket). Summed per step,
 *  never approximated from the total. A step whose ad offers a real
 *  non-mobile-money payment method (a bank transfer, say) is skipped
 *  entirely - that specific trade never needed a cash withdrawal, so
 *  there's no fee to charge it. */
export function mpesaFeeForSteps(steps: FillStep[]): number {
  return steps.reduce((sum, s) => sum + (s.hasNonMobileMoneyMethod ? 0 : getMPesaWithdrawalFee(s.fiatValue)), 0);
}

/**
 * Full round trip: buy from real ads to (try to) reach `targetFiat`, then
 * sell exactly what was actually acquired to real ads on the other side -
 * never the original wish if the buy leg came up short. Applies Phase 8's
 * configured costs plus, for MZN, the real M-Pesa cash-out fee - per
 * merchant, summed (see mpesaFeeForSteps) - when `includeMpesaFee` is true.
 */
export function planRoundTrip(
  buyAds: P2PAd[],
  sellAds: P2PAd[],
  targetFiat: number,
  costs: CapitalSettings,
  includeMpesaFee: boolean
): RoundTripPlan {
  const buy = fillByFiatAmount(buyAds, targetFiat);
  const sell = fillByQuantity(sellAds, buy.filledQuantity);

  const soldQuantity = sell.filledQuantity;
  const unsoldQuantity = Math.max(0, buy.filledQuantity - sell.filledQuantity);
  const costBasisForSold = buy.filledQuantity > 0 ? buy.filledFiat * (soldQuantity / buy.filledQuantity) : 0;
  const proceedsFromSold = sell.filledFiat;

  const grossResult = proceedsFromSold - costBasisForSold;
  const configuredCosts = estimateCosts(costs, buy.filledFiat).total;
  const mpesaFee = includeMpesaFee ? mpesaFeeForSteps(buy.steps) : 0;
  const netResult = grossResult - configuredCosts - mpesaFee;

  return {
    buy,
    sell,
    targetFiat,
    soldQuantity,
    unsoldQuantity,
    costBasisForSold,
    proceedsFromSold,
    configuredCosts,
    mpesaFee,
    grossResult,
    netResult,
  };
}

export type OptimizationResult = {
  bestAmount: number;
  bestPlan: RoundTripPlan;
  evaluated: number;
  candidateRange: { min: number; max: number; step: number };
  /** False means every candidate amount in range lost money - `bestAmount`
   *  is only "the least bad", never a recommendation to act on. */
  isProfitable: boolean;
  /** True when the ideal amount is the top of the searched range (the
   *  book's own real capacity or the 30k ceiling) rather than a genuine
   *  interior optimum - more visible liquidity could push it higher. */
  hitCeiling: boolean;
};

const DEFAULT_MIN_AMOUNT = 600; // Binance's own typical per-order minimum for these ads
const DEFAULT_MAX_AMOUNT = 30_000; // realistic ceiling for a single "ideal amount" search
// Every whole MZN is tested, not sampled - a coarser step can silently step
// over the exact amount that avoids an M-Pesa bracket jump or maximizes use
// of the single best-priced ad, which is the entire point of this search.
const DEFAULT_STEP = 1;

/**
 * Net profit isn't a smooth function of the amount invested: the M-Pesa
 * tariff is tiered (a real bracket jump can make a slightly smaller amount
 * net more than a slightly larger one - lib/mpesaFees.ts), and as the
 * amount grows it starts eating into worse-priced ads on both legs. There's
 * no formula to solve for the best amount directly, so this tries every
 * real candidate amount (every whole MZN, from `minAmount` up to whichever
 * is smaller of `maxAmount` and the book's own real capacity - searching
 * beyond either is pointless) and returns whichever one actually produced
 * the highest real net result via planRoundTrip. A real search over real
 * numbers, not a guessed optimum, and never skips a value.
 */
export function findBestAmount(
  buyAds: P2PAd[],
  sellAds: P2PAd[],
  costs: CapitalSettings,
  includeMpesaFee: boolean,
  opts?: { minAmount?: number; maxAmount?: number; step?: number }
): OptimizationResult {
  const minAmount = opts?.minAmount ?? DEFAULT_MIN_AMOUNT;
  const step = opts?.step ?? DEFAULT_STEP;
  const totalCapacity = buyAds.reduce((sum, ad) => sum + Math.min(ad.maxSingleTransAmount, ad.availableQuantity * ad.price), 0);
  const ceiling = opts?.maxAmount ?? DEFAULT_MAX_AMOUNT;
  const maxAmount = Math.max(minAmount, Math.min(ceiling, totalCapacity > 0 ? Math.floor(totalCapacity) : ceiling));

  let bestPlan = planRoundTrip(buyAds, sellAds, minAmount, costs, includeMpesaFee);
  let bestAmount = minAmount;
  let evaluated = 1;

  for (let amount = minAmount + step; amount <= maxAmount; amount += step) {
    const plan = planRoundTrip(buyAds, sellAds, amount, costs, includeMpesaFee);
    evaluated++;
    if (plan.netResult > bestPlan.netResult) {
      bestPlan = plan;
      bestAmount = amount;
    }
  }

  return {
    bestAmount,
    bestPlan,
    evaluated,
    candidateRange: { min: minAmount, max: maxAmount, step },
    isProfitable: bestPlan.netResult > 0,
    hitCeiling: bestAmount === maxAmount,
  };
}
