import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cronAuth';
import { runMarketSync } from '@/lib/marketAnalysis';
import { getMarketSeries, getLatestAccountSnapshots, query } from '@/lib/db';
import { getMidRates } from '@/lib/exchangeRates';
import { recordAccountSnapshot } from '@/lib/wallet';
import { evaluateAlerts, evaluateMultiAdOpportunityAlerts } from '@/lib/alerts';

// "dados antigos" SYSTEM alert (spec section 13) - if a user's orders sync
// hasn't run in this long, notify once per staleness episode (reset the
// moment they sync again, via stale_sync_notified_at < last_synced_at).
const STALE_SYNC_HOURS = 48;

async function notifyStaleOrderSyncs(): Promise<void> {
  const rows = await query<{ user_id: string; last_synced_at: string | null; stale_sync_notified_at: string | null }>(
    `select user_id, last_synced_at, stale_sync_notified_at from p2p_manager.sync_state
     where platform = 'binance' and resource = 'orders'`
  );

  for (const row of rows) {
    const lastSyncedMs = row.last_synced_at ? new Date(row.last_synced_at).getTime() : null;
    const isStale = lastSyncedMs == null || lastSyncedMs < Date.now() - STALE_SYNC_HOURS * 3600_000;
    if (!isStale) continue;

    const notifiedMs = row.stale_sync_notified_at ? new Date(row.stale_sync_notified_at).getTime() : null;
    const alreadyNotifiedForThisEpisode = notifiedMs != null && (lastSyncedMs == null || notifiedMs > lastSyncedMs);
    if (alreadyNotifiedForThisEpisode) continue;

    const title = 'Sincronização de ordens desatualizada';
    const body = lastSyncedMs
      ? `A última sincronização foi há mais de ${STALE_SYNC_HOURS}h. Carrega em "Sincronizar agora" no Início para atualizar o teu histórico.`
      : 'Ainda não sincronizaste as tuas ordens. Carrega em "Sincronizar agora" no Início.';

    await query(`insert into p2p_manager.notifications (user_id, type, title, body) values ($1, 'sync_stale', $2, $3)`, [row.user_id, title, body]);
    await query(`update p2p_manager.sync_state set stale_sync_notified_at = now() where user_id = $1 and platform = 'binance' and resource = 'orders'`, [
      row.user_id,
    ]);
  }
}

/**
 * Snapshots real Binance P2P ad prices for every tracked pair/side, feeds
 * the trend-reversal detector, and pushes a notification when a reversal is
 * confirmed. Vercel's Hobby plan only allows once-a-day cron jobs, so this
 * is meant to be scheduled externally (cron-job.org or similar) rather than
 * via vercel.json - see README. Every ~10 minutes is a reasonable cadence.
 *
 * Also records one real account-value point per tick (lib/wallet.ts's
 * recordAccountSnapshot), evaluates every configured alert (lib/alerts.ts's
 * evaluateAlerts - the single call site for this now, since this route is
 * the only place with both the market result and the account-snapshot
 * delta alerts need - plus evaluateMultiAdOpportunityAlerts, a separate,
 * heavier check that fetches the real full order book, so it's its own
 * step rather than folded into evaluateAlerts), and checks for stale
 * orders syncs. Each step has its own try/catch: a failure in one must
 * never block the others.
 *
 * GET, with header: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let result;
  try {
    result = await runMarketSync();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  let accountSnapshotError: string | null = null;
  try {
    const marketSeries = await getMarketSeries();
    const { mznRate, zarRate } = getMidRates(marketSeries);
    await recordAccountSnapshot(mznRate, zarRate);
  } catch (err) {
    accountSnapshotError = err instanceof Error ? err.message : String(err);
  }

  let alertsError: string | null = null;
  try {
    const [latest, previous] = await getLatestAccountSnapshots(2);
    await evaluateAlerts({
      prices: result.checked,
      spreads: result.spreads,
      liquidity: result.liquidity,
      accountBalance: latest?.totalMzn != null ? { current: latest.totalMzn, previous: previous?.totalMzn ?? null } : null,
    });
  } catch (err) {
    alertsError = err instanceof Error ? err.message : String(err);
  }

  let multiAdAlertsError: string | null = null;
  try {
    await evaluateMultiAdOpportunityAlerts();
  } catch (err) {
    multiAdAlertsError = err instanceof Error ? err.message : String(err);
  }

  let staleSyncError: string | null = null;
  try {
    await notifyStaleOrderSyncs();
  } catch (err) {
    staleSyncError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ ...result, accountSnapshotError, alertsError, multiAdAlertsError, staleSyncError });
}
