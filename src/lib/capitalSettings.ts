import type { Profile } from '@/lib/db';

export type CapitalSettings = {
  referenceMode: 'real' | 'manual';
  referenceAmount: number; // used only when referenceMode = 'manual'
  tradeFeePct: number;
  conversionCostPct: number;
  externalCostFixed: number;
  safetyMarginPct: number;
};

export const DEFAULT_CAPITAL_SETTINGS: CapitalSettings = {
  referenceMode: 'real',
  referenceAmount: 1000,
  tradeFeePct: 0,
  conversionCostPct: 0,
  externalCostFixed: 0,
  safetyMarginPct: 0,
};

export function fromProfile(profile: Profile | null): CapitalSettings {
  if (!profile) return DEFAULT_CAPITAL_SETTINGS;
  return {
    referenceMode: profile.capital_reference_mode,
    referenceAmount: Number(profile.capital_reference_amount),
    tradeFeePct: Number(profile.trade_fee_pct),
    conversionCostPct: Number(profile.conversion_cost_pct),
    externalCostFixed: Number(profile.external_cost_fixed),
    safetyMarginPct: Number(profile.safety_margin_pct),
  };
}

/** Has the user actually told us anything about their real costs? Distinct
 *  from "costs are zero" - unconfigured and genuinely-zero look the same
 *  numerically, so this is what the Opportunity Center's "Custos
 *  conhecidos" score keys off, not the numbers themselves. */
export function isConfigured(s: CapitalSettings): boolean {
  return s.tradeFeePct > 0 || s.conversionCostPct > 0 || s.externalCostFixed > 0 || s.safetyMarginPct > 0;
}

export type CostEstimate = { pct: number; fixed: number; total: number };

/** Total cost to deduct from a gross amount, in the same fiat as that
 *  amount - trade fee + conversion cost + safety margin as one combined
 *  percentage, plus any flat external cost. */
export function estimateCosts(settings: CapitalSettings, grossAmount: number): CostEstimate {
  const pct = settings.tradeFeePct + settings.conversionCostPct + settings.safetyMarginPct;
  const fixed = settings.externalCostFixed;
  const total = (grossAmount * pct) / 100 + fixed;
  return { pct, fixed, total };
}

export type ReferenceAmount = { amount: number; source: 'real' | 'manual' };

/**
 * "Real" mode uses the account's actual total wallet value (in the
 * reference fiat, already converted by the caller via getMidRates - see
 * lib/wallet.ts's RealWalletSnapshot.totalMzn); "manual" uses the
 * configured fixed amount. Falls back to manual when the real value isn't
 * available (wallet fetch failed) - never silently shows a zero.
 */
export function resolveReferenceAmount(settings: CapitalSettings, realAmount: number | null): ReferenceAmount {
  if (settings.referenceMode === 'real' && realAmount != null && realAmount > 0) {
    return { amount: realAmount, source: 'real' };
  }
  return { amount: settings.referenceAmount, source: 'manual' };
}
