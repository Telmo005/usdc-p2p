'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';

export type SettingsActionState = { error?: string; success?: string } | undefined;

const MODES = ['real', 'manual'] as const;

function parseNonNegative(formData: FormData, key: string): number | null {
  const value = Number(formData.get(key));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function updateCapitalSettingsAction(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const { user } = await requireUser();

  const mode = String(formData.get('capital_reference_mode') ?? '');
  if (!MODES.includes(mode as (typeof MODES)[number])) return { error: 'Modo de capital de referência inválido.' };

  const referenceAmount = parseNonNegative(formData, 'capital_reference_amount');
  const tradeFeePct = parseNonNegative(formData, 'trade_fee_pct');
  const conversionCostPct = parseNonNegative(formData, 'conversion_cost_pct');
  const externalCostFixed = parseNonNegative(formData, 'external_cost_fixed');
  const safetyMarginPct = parseNonNegative(formData, 'safety_margin_pct');

  if (
    referenceAmount == null ||
    tradeFeePct == null ||
    conversionCostPct == null ||
    externalCostFixed == null ||
    safetyMarginPct == null
  ) {
    return { error: 'Todos os valores têm de ser números iguais ou maiores que zero.' };
  }

  await query(
    `update p2p_manager.profiles set
       capital_reference_mode = $2,
       capital_reference_amount = $3,
       trade_fee_pct = $4,
       conversion_cost_pct = $5,
       external_cost_fixed = $6,
       safety_margin_pct = $7
     where id = $1`,
    [user.id, mode, referenceAmount, tradeFeePct, conversionCostPct, externalCostFixed, safetyMarginPct]
  );

  revalidatePath('/settings');
  return { success: 'Configuração de capital guardada.' };
}
