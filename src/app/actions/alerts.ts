'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createAlert, setAlertActive, deleteAlert, type AlertCondition } from '@/lib/alerts';

export type AlertActionState = { error?: string; success?: string } | undefined;

export async function createAlertAction(_prev: AlertActionState, formData: FormData): Promise<AlertActionState> {
  const { user } = await requireUser();

  const kind = String(formData.get('kind') ?? '');
  const operator = String(formData.get('operator') ?? '') as 'gte' | 'lte';
  const threshold = Number(formData.get('threshold'));

  if (!['gte', 'lte'].includes(operator)) return { error: 'Condição inválida.' };
  if (!Number.isFinite(threshold)) return { error: 'Indica um valor limite.' };

  let condition: AlertCondition;
  if (kind === 'price') {
    const asset = String(formData.get('asset') ?? 'USDT');
    const fiat = String(formData.get('fiat') ?? '').trim().toUpperCase();
    const side = String(formData.get('side') ?? '') as 'buy' | 'sell';
    if (!fiat) return { error: 'Indica a moeda.' };
    if (!['buy', 'sell'].includes(side)) return { error: 'Indica compra ou venda.' };
    condition = { kind: 'price', asset, fiat, side, operator, threshold };
  } else if (kind === 'cycle') {
    condition = { kind: 'cycle', operator, threshold };
  } else {
    return { error: 'Tipo de alerta inválido.' };
  }

  await createAlert(user.id, condition);
  revalidatePath('/settings');
  return { success: 'Alerta criado.' };
}

export async function toggleAlertAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const id = String(formData.get('id') ?? '');
  const active = formData.get('active') === 'true';
  await setAlertActive(user.id, id, active);
  revalidatePath('/settings');
}

export async function deleteAlertAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const id = String(formData.get('id') ?? '');
  await deleteAlert(user.id, id);
  revalidatePath('/settings');
}
