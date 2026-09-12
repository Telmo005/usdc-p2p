import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cronAuth';
import { runMarketSync } from '@/lib/marketAnalysis';

/**
 * Snapshots real Binance P2P ad prices for every tracked pair/side, feeds
 * the trend-reversal detector, and pushes a notification when a reversal is
 * confirmed. Vercel's Hobby plan only allows once-a-day cron jobs, so this
 * is meant to be scheduled externally (cron-job.org or similar) rather than
 * via vercel.json - see README. Every ~10 minutes is a reasonable cadence.
 *
 * GET, with header: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runMarketSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
