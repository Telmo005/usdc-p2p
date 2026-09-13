'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createLot, recordSale, InsufficientQuantityError } from '@/lib/simulation';

export type SimActionState = { error?: string; success?: string } | undefined;

function num(formData: FormData, name: string): number {
  const raw = formData.get(name);
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

export async function addLotAction(_prev: SimActionState, formData: FormData): Promise<SimActionState> {
  const { user } = await requireUser();

  const asset = String(formData.get('asset') ?? 'USDT').trim() || 'USDT';
  const fiat = String(formData.get('fiat') ?? '').trim().toUpperCase();
  const quantity = num(formData, 'quantity');
  const buyPrice = num(formData, 'buyPrice');
  const buyFee = num(formData, 'buyFee') || 0;
  const notes = String(formData.get('notes') ?? '').trim() || null;

  if (!fiat) return { error: 'Indica a moeda fiat.' };
  if (!(quantity > 0)) return { error: 'A quantidade tem de ser maior que zero.' };
  if (!(buyPrice > 0)) return { error: 'O preço de compra tem de ser maior que zero.' };

  await createLot(user.id, { asset, fiat, quantity, buyPrice, buyFee, notes });
  revalidatePath('/simulation');
  return { success: `Registada compra de ${quantity} ${asset} a ${buyPrice} ${fiat}.` };
}

export async function recordSaleAction(_prev: SimActionState, formData: FormData): Promise<SimActionState> {
  const { user } = await requireUser();

  const asset = String(formData.get('asset') ?? 'USDT').trim() || 'USDT';
  const fiat = String(formData.get('fiat') ?? '').trim().toUpperCase();
  const quantity = num(formData, 'quantity');
  const sellPrice = num(formData, 'sellPrice');
  const sellFee = num(formData, 'sellFee') || 0;

  if (!fiat) return { error: 'Indica a moeda fiat.' };
  if (!(quantity > 0)) return { error: 'A quantidade tem de ser maior que zero.' };
  if (!(sellPrice > 0)) return { error: 'O preço de venda tem de ser maior que zero.' };

  try {
    const result = await recordSale(user.id, { asset, fiat, quantity, sellPrice, sellFee });
    revalidatePath('/simulation');
    const sign = result.realizedProfit >= 0 ? 'lucro' : 'prejuízo';
    return { success: `Venda registada: ${sign} de ${Math.abs(result.realizedProfit).toFixed(2)} ${fiat} em ${result.lotsTouched} lote(s).` };
  } catch (err) {
    if (err instanceof InsufficientQuantityError) return { error: err.message };
    return { error: err instanceof Error ? err.message : 'Falha ao registar a venda.' };
  }
}
