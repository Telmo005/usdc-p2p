import { requireUser } from '@/lib/auth';
import { query, getUnreadNotificationCount, getUserNotifications } from '@/lib/db';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUser();

  const [syncRow] = await query<{ last_synced_at: string | null; last_error: string | null }>(
    `select last_synced_at, last_error from p2p_manager.sync_state where user_id = $1 and platform = 'binance' and resource = 'orders'`,
    [user.id]
  );

  const [unreadCount, notifications] = await Promise.all([getUnreadNotificationCount(user.id), getUserNotifications(user.id, 15)]);

  return (
    <div className="flex min-h-screen">
      <Sidebar connectionOk={!!syncRow && !syncRow.last_error} lastSyncedAt={syncRow?.last_synced_at ?? null} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar
          fullName={profile?.full_name ?? null}
          referenceCurrency={profile?.reference_currency ?? 'MZN'}
          unreadCount={unreadCount}
          notifications={notifications}
        />
        <main className="flex-1 overflow-y-auto bg-background px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
