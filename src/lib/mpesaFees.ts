/**
 * Real M-Pesa Moçambique cash-out ("levantamento") tariff - not a guess,
 * not a flat percentage. Most USDT sellers in this market are M-Pesa
 * agents who require the buyer to withdraw cash to pay them (see the
 * "APENAS LEVANTAMENTO M-PESA" requirement on real ads) - that withdrawal
 * itself costs a real, tiered fee, which is a genuine cost of the BUY side
 * whenever payment is M-Pesa. Selling (M-Pesa deposit/cash-in) is free per
 * the same tariff, so this only ever applies to buying.
 *
 * Source: Vodafone M-Pesa, S.A. "Tabela de Comissões e Encargos"
 * (https://www.vm.co.mz/M-Pesa/Tarifario), effective 15 de Abril de 2026 -
 * fetched directly from the official PDF. Vodafone's own document notes
 * "Estas tarifas podem ser alteradas a qualquer momento" - if they
 * republish a new table, update MPESA_WITHDRAWAL_BRACKETS below to match,
 * don't extrapolate a formula they never published.
 */
export const MPESA_TARIFF_EFFECTIVE_DATE = '2026-04-15';
export const MPESA_TARIFF_SOURCE_URL = 'https://www.vm.co.mz/M-Pesa/Tarifario';

/** "Levantamento de numerário (cash out) no Agente ou na ATM para cliente
 *  M-Pesa" - identical fee whether at an agent or an ATM per the tariff's
 *  own note. Below 20 MT there's no withdrawal bracket (M-Pesa's own
 *  minimum); above 75 000 MT is beyond M-Pesa's own per-transaction cap. */
const MPESA_WITHDRAWAL_BRACKETS: Array<{ min: number; max: number; fee: number }> = [
  { min: 20, max: 100, fee: 4 },
  { min: 101, max: 1_000, fee: 10 },
  { min: 1_001, max: 2_000, fee: 20 },
  { min: 2_001, max: 5_000, fee: 40 },
  { min: 5_001, max: 10_000, fee: 80 },
  { min: 10_001, max: 15_000, fee: 100 },
  { min: 15_001, max: 20_000, fee: 120 },
  { min: 20_001, max: 25_000, fee: 150 },
  { min: 25_001, max: 50_000, fee: 300 },
  { min: 50_001, max: 75_000, fee: 450 },
];

export const MPESA_MAX_TRANSACTION_MZN = 75_000;

/** The real cash-out fee (MZN) for withdrawing `amountMzn` at an M-Pesa
 *  agent/ATM. Returns 0 below the 20 MT minimum (no bracket exists) - never
 *  fabricates a fee outside what Vodafone actually publishes. Above the
 *  75 000 MT per-transaction cap, returns the highest bracket's fee as the
 *  closest real reference point (a real transaction that size would need
 *  to be split into multiple withdrawals anyway). */
export function getMPesaWithdrawalFee(amountMzn: number): number {
  if (!Number.isFinite(amountMzn) || amountMzn < 20) return 0;
  const bracket = MPESA_WITHDRAWAL_BRACKETS.find((b) => amountMzn >= b.min && amountMzn <= b.max);
  if (bracket) return bracket.fee;
  return MPESA_WITHDRAWAL_BRACKETS[MPESA_WITHDRAWAL_BRACKETS.length - 1].fee;
}
