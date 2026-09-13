import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cronAuth';
import { runMarketSync } from '@/lib/marketAnalysis';
import { getMarketSeries } from '@/lib/db';
import { getMidRates } from '@/lib/exchangeRates';
import { recordAccountSnapshot } from '@/lib/wallet';

/**
 * Snapshots real Binance P2P ad prices for every tracked pair/side, feeds
 * the trend-reversal detector, and pushes a notification when a reversal is
 * confirmed. Vercel's Hobby plan only allows once-a-day cron jobs, so this
 * is meant to be scheduled externally (cron-job.org or similar) rather than
 * via vercel.json - see README. Every ~10 minutes is a reasonable cadence.
 *
 * Also records one real account-value point per tick (see
 * lib/wallet.ts's recordAccountSnapshot) - piggybacking on this same
 * schedule rather than needing a second external cron. Kept in its own
 * try/catch: a wallet-read failure must never break the market sync above
 * it, and vice versa.
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

  return NextResponse.json({ ...result, accountSnapshotError });
}
