/**
 * Client for the shared messaging gateway (Android push to the system
 * owner's own device) - a separate project's service, not modified from
 * here. Same contract as the sibling apps that already use it: POST
 * {baseUrl}/api/internal/messages/push with {title, body}, bearer token,
 * never throws (a gateway outage must never break the market-sync cron).
 *
 * Env vars (server-side only): MESSAGING_BASE_URL, MESSAGING_API_KEY.
 */
const APP_NAME = 'P2P Manager';
const REQUEST_TIMEOUT_MS = 8_000;

function config(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.MESSAGING_BASE_URL;
  const apiKey = process.env.MESSAGING_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

export async function sendPush(subject: string, description: string): Promise<void> {
  const cfg = config();
  const body = `${subject}\n\n${description}`;
  if (!cfg) {
    console.error('sendPush: MESSAGING_BASE_URL/MESSAGING_API_KEY não configurados, a ignorar', { subject });
    return;
  }

  try {
    const res = await fetch(`${cfg.baseUrl}/api/internal/messages/push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: APP_NAME, body: body.slice(0, 500) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`sendPush falhou: ${res.status} ${text}`, { subject });
    }
  } catch (err) {
    console.error('sendPush: fetch falhou', { subject, err });
  }
}
