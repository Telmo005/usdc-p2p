import { NextRequest, NextResponse } from 'next/server';
import { getApiUser } from '@/lib/apiAuth';
import { getMarketSeries } from '@/lib/db';
import { getMidRates } from '@/lib/exchangeRates';
import { getRealWalletSnapshot } from '@/lib/wallet';

/**
 * Real Binance balance (Spot + Funding + Simple Earn Flexible), the same
 * data the web Wallet page renders via lib/wallet.ts - exposed as JSON so
 * the Android app can read it too. BINANCE_API_KEY/SECRET never leave this
 * server; the client only ever sees the resulting balances. Read-only,
 * authenticated (see lib/apiAuth.ts - accepts either the mobile app's
 * Bearer token or the web app's session cookie).
 */
export async function GET(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const marketSeries = await getMarketSeries();
  const { mznRate, zarRate } = getMidRates(marketSeries);

  try {
    const snapshot = await getRealWalletSnapshot(mznRate, zarRate);
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao ler o saldo da Binance.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
