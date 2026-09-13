'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';

export async function markAllNotificationsRead() {
  const { user } = await requireUser();
  await query(`update p2p_manager.notifications set read_at = now() where user_id = $1 and read_at is null`, [user.id]);
  revalidatePath('/', 'layout');
}

export async function markNotificationRead(notificationId: string) {
  const { user } = await requireUser();
  await query(`update p2p_manager.notifications set read_at = now() where id = $1 and user_id = $2 and read_at is null`, [notificationId, user.id]);
  revalidatePath('/', 'layout');
}
