const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * fetch() + JSON parsing that aborts if the whole thing takes too long.
 * Deliberately keeps the abort signal alive through `res.json()`, not just
 * until the response headers arrive - a connection that stalls mid-body
 * (headers received, body never finishes) would otherwise hang forever with
 * no timeout at all, since fetch()'s own promise already resolved.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const json = await res.json();
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = fetchWithTimeout;
