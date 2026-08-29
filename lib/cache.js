// Tiny in-memory TTL cache with single-flight request coalescing. If two
// callers ask for the same key while a fetch for it is already in flight,
// the second one just awaits the first's result instead of triggering a
// duplicate call to a platform's API - this is what turns "the 15s
// auto-refresh timer plus a stray extra request" into one real fetch instead
// of two, and turns any repeat lookup within the TTL window into an
// in-memory hit with no network call at all.

const store = new Map(); // key -> { value, expiresAt }
const inFlight = new Map(); // key -> { promise, tag }

/**
 * Returns the cached value for `key` if still fresh, otherwise runs `fn()`
 * (once, even under concurrent callers) and caches the result for `ttlMs`.
 *
 * `tag` and `minTag` exist for exactly one reason: an in-flight fetch that
 * was started on behalf of a low-priority background job must never become
 * the thing a high-priority, user-facing request ends up silently waiting
 * behind. Pass `tag` when kicking off a fetch that might be low priority, and
 * `minTag` on a call that must not join an in-flight fetch tagged below it -
 * such a call starts (and later caches) its own fresh fetch instead.
 */
async function getOrFetch(key, fn, ttlMs, { tag, minTag } = {}) {
  const cached = store.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const existing = inFlight.get(key);
  if (existing && (!minTag || existing.tag === minTag)) {
    return existing.promise;
  }

  const promise = (async () => {
    try {
      const value = await fn();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
    }
  })();

  inFlight.set(key, { promise, tag });
  return promise;
}

module.exports = { getOrFetch };
