'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import {
  addCounterpartyToWatchlist,
  addAdvertiserToWatchlist,
  removeCounterpartyFromWatchlist,
  removeAdvertiserFromWatchlist,
} from '@/lib/watchlist';

export async function toggleCounterpartyWatchAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const id = String(formData.get('counterpartyId') ?? '');
  const watched = formData.get('watched') === 'true';
  if (watched) await removeCounterpartyFromWatchlist(user.id, id);
  else await addCounterpartyToWatchlist(user.id, id);
  revalidatePath('/customers');
  revalidatePath('/watchlist');
}

export async function toggleAdvertiserWatchAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const nickname = String(formData.get('nickname') ?? '');
  const watched = formData.get('watched') === 'true';
  if (watched) await removeAdvertiserFromWatchlist(user.id, nickname);
  else await addAdvertiserToWatchlist(user.id, nickname);
  revalidatePath('/ads');
  revalidatePath('/watchlist');
}
