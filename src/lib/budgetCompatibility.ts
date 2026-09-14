import type { P2PAd } from '@/lib/binancePublicP2P';

/**
 * "Consigo efetivamente executar esta operação com o valor que estou a
 * simular?" - a real ad's price can be attractive and still be unusable
 * ALONE for a given amount if that amount falls outside its own posted
 * min/max/capacity. This is deliberately narrower than what the
 * multi-merchant fill (lib/orderBookSimulator.ts) already computes
 * correctly: that fill can legitimately route a PARTIAL amount to an ad
 * whose max is below the full target - this module answers the different
 * question "could this one merchant, by themselves, cover the whole
 * amount," which the fill logic never needed to ask. One place, reused by
 * every screen that shows this - never re-derived ad hoc.
 */

export type BudgetMode = 'no_restriction' | 'respect_budget';

export type AdCompatibility = {
  compatible: boolean;
  reason: string | null;
};

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

export function checkAdCompatibility(ad: P2PAd, targetFiat: number): AdCompatibility {
  if (targetFiat < ad.minSingleTransAmount) {
    return { compatible: false, reason: `Mínimo ${fmt(ad.minSingleTransAmount)} - acima do valor simulado de ${fmt(targetFiat)}` };
  }
  if (targetFiat > ad.maxSingleTransAmount) {
    return { compatible: false, reason: `Máximo ${fmt(ad.maxSingleTransAmount)} - abaixo do valor simulado de ${fmt(targetFiat)}` };
  }
  const capacity = ad.availableQuantity * ad.price;
  if (targetFiat > capacity) {
    return { compatible: false, reason: `Só tem ${fmt(capacity)} disponível ao preço atual - abaixo do valor simulado de ${fmt(targetFiat)}` };
  }
  return { compatible: true, reason: null };
}

export function summarizeCompatibility(ads: P2PAd[], targetFiat: number): { total: number; compatible: number; incompatible: number } {
  const compatible = ads.filter((a) => checkAdCompatibility(a, targetFiat).compatible).length;
  return { total: ads.length, compatible, incompatible: ads.length - compatible };
}
