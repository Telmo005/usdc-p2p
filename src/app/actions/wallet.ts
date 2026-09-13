'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createWalletMovement } from '@/lib/wallet';

export type WalletActionState = { error?: string; success?: string } | undefined;

const TYPES = ['deposit', 'withdrawal', 'adjustment'] as const;

export async function addWalletMovementAction(_prev: WalletActionState, formData: FormData): Promise<WalletActionState> {
  const { user } = await requireUser();

  const type = String(formData.get('type') ?? '');
  const asset = String(formData.get('asset') ?? 'USDT').trim() || 'USDT';
  const amount = Number(formData.get('amount'));
  const notes = String(formData.get('notes') ?? '').trim() || null;

  if (!TYPES.includes(type as (typeof TYPES)[number])) return { error: 'Tipo de movimento inválido.' };
  if (!Number.isFinite(amount) || amount === 0) return { error: 'Indica um valor diferente de zero.' };
  if (type !== 'adjustment' && amount < 0) return { error: 'Depósitos e levantamentos usam um valor positivo - usa "Ajuste" para uma correção negativa.' };

  await createWalletMovement(user.id, { type: type as (typeof TYPES)[number], asset, amount, notes });
  revalidatePath('/wallet');
  return { success: 'Movimento registado.' };
}
