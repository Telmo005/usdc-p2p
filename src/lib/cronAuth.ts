import { timingSafeEqual } from 'node:crypto';

/**
 * Guards every /api/cron/* route. A plain `!==` string compare would (a)
 * silently authorize any caller sending the literal "Bearer undefined" if
 * CRON_SECRET is ever unset, and (b) leak timing information about how many
 * leading bytes matched. Neither is exploitable for much here, but there's
 * no reason not to close both properly.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
