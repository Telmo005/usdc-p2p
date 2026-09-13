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

/**
 * Full round trip: buy from real ads to (try to) reach `targetFiat`, then
 * sell exactly what was actually acquired to real ads on the other side -
 * never the original wish if the buy leg came up short. Applies Phase 8's
 * configured costs plus, for MZN, the real M-Pesa cash-out fee on the
 * buy leg's total outlay (most sellers require withdrawal to pay them -
 * see lib/mpesaFees.ts) when `includeMpesaFee` is true.
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
  const mpesaFee = includeMpesaFee ? getMPesaWithdrawalFee(buy.filledFiat) : 0;
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
