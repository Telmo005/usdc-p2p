/**
 * Shared vocabulary for labeling where a number on screen came from and how
 * old it is - REAL (binance_private/binance_public) vs CALCULADO vs ESTIMADO
 * vs MANUAL vs SIMULADO vs HISTÓRICO. Every screen should use this instead of
 * inventing its own wording, so "estimated" means the same thing everywhere.
 */

export type DataSource = 'binance_private' | 'binance_public' | 'calculated' | 'estimated' | 'manual' | 'simulated' | 'historical';

export const DATA_SOURCE_CONFIG: Record<DataSource, { label: string; dot: string; badge: string }> = {
  binance_private: { label: 'Binance (conta)', dot: 'bg-positive', badge: 'REAL' },
  binance_public: { label: 'Binance P2P (público)', dot: 'bg-positive', badge: 'REAL' },
  calculated: { label: 'Calculado', dot: 'bg-info', badge: 'CALCULADO' },
  estimated: { label: 'Estimado', dot: 'bg-accent', badge: 'ESTIMADO' },
  manual: { label: 'Inserido manualmente', dot: 'bg-muted', badge: 'MANUAL' },
  simulated: { label: 'Simulado', dot: 'bg-accent', badge: 'SIMULADO' },
  historical: { label: 'Histórico', dot: 'bg-muted', badge: 'HISTÓRICO' },
};

function toMs(timestamp: number | string | null | undefined): number | null {
  if (timestamp == null) return null;
  const ms = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** "agora", "há 4s", "há 12 min", "há 3h", "há 2d", "nunca" - generalizes the
 *  age formatting that used to live only inside Topbar's notification bell. */
export function formatAge(timestamp: number | string | null | undefined): string {
  const ms = toMs(timestamp);
  if (ms == null) return 'nunca';

  const diffMs = Date.now() - ms;
  if (diffMs < 0) return 'agora';

  const seconds = Math.round(diffMs / 1000);
  if (seconds < 5) return 'agora';
  if (seconds < 60) return `há ${seconds}s`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;

  const days = Math.round(hours / 24);
  return `há ${days}d`;
}

export type Freshness = 'live' | 'delayed' | 'stale' | 'unknown';

/** Buckets an age into live/delayed/stale for a 🟢/🟡/🔴-style indicator.
 *  Defaults suit a fast-moving feed (market ticks); callers with a slower
 *  natural cadence (e.g. a manually-triggered orders sync) should pass their
 *  own thresholds instead of assuming these. */
export function getFreshness(
  timestamp: number | string | null | undefined,
  opts?: { delayedAfterMs?: number; staleAfterMs?: number }
): Freshness {
  const ms = toMs(timestamp);
  if (ms == null) return 'unknown';

  const delayedAfterMs = opts?.delayedAfterMs ?? 60_000;
  const staleAfterMs = opts?.staleAfterMs ?? 15 * 60_000;
  const age = Date.now() - ms;

  if (age < delayedAfterMs) return 'live';
  if (age < staleAfterMs) return 'delayed';
  return 'stale';
}
