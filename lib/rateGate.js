// Serializes every outbound request to a P2P platform's endpoint through a
// per-platform spaced-out queue, so N connected browsers never add up to a
// burst that trips a platform's WAF - and so one platform's cooldown never
// delays another's.
//
// Two priority lanes per platform: 'high' (the order book the user is
// actively looking at) always drains before 'low' (the background whole-
// platform payment-method scan). Without this, a slow low-priority scan that
// happened to get queued first could leave the main book stuck loading for
// as long as the scan takes.

// Verified live during this session: 14 sequential requests to Binance at
// ~1s spacing all returned 200 with no throttling. The existing
// cooldown/backoff below still catches it and backs off automatically if a
// platform ever disagrees.
const MIN_INTERVAL_MS = 1000;
const COOLDOWN_MS = 45_000;

// Hard ceiling on any single task, independent of whatever timeout the task
// itself thinks it has. This is the last line of defense: even if a future
// bug (or a platform doing something unusual) makes a task hang forever, the
// shared per-platform queue must never be able to lock up permanently for
// every future request because of it.
const TASK_WATCHDOG_MS = 20_000;

const gates = new Map(); // platformId -> gate state

function getGate(platformId) {
  let gate = gates.get(platformId);
  if (!gate) {
    gate = {
      highQueue: [],
      lowQueue: [],
      running: false,
      cooldownUntil: 0,
      lastRunAt: 0,
      consecutiveFailures: 0,
    };
    gates.set(platformId, gate);
  }
  return gate;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function watchdog() {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Tarefa excedeu o limite de ${TASK_WATCHDOG_MS}ms (watchdog do rateGate)`)), TASK_WATCHDOG_MS);
  });
}

async function pump(platformId) {
  const gate = getGate(platformId);
  if (gate.running) return;
  gate.running = true;

  try {
    while (gate.highQueue.length || gate.lowQueue.length) {
      const task = gate.highQueue.length ? gate.highQueue.shift() : gate.lowQueue.shift();

      const now = Date.now();
      if (now < gate.cooldownUntil) await sleep(gate.cooldownUntil - now);

      const wait = Math.max(0, gate.lastRunAt + MIN_INTERVAL_MS - Date.now());
      if (wait > 0) await sleep(wait);

      gate.lastRunAt = Date.now();
      // Run the task detached from the loop's own await so a watchdog timeout
      // can move on regardless; swallow a late rejection from the abandoned
      // task so it doesn't surface as an unhandled promise rejection later.
      const taskPromise = task.fn();
      taskPromise.catch(() => {});

      try {
        const result = await Promise.race([taskPromise, watchdog()]);
        gate.consecutiveFailures = 0;
        task.resolve(result);
      } catch (err) {
        gate.consecutiveFailures += 1;
        if (gate.consecutiveFailures >= 3) gate.cooldownUntil = Date.now() + COOLDOWN_MS;
        task.reject(err);
      }
    }
  } finally {
    gate.running = false;
  }
}

/** Runs `fn` respecting the platform's spacing/cooldown; `priority: 'high'` jumps ahead of any queued 'low' work. */
function schedule(platformId, fn, priority = 'high') {
  const gate = getGate(platformId);
  return new Promise((resolve, reject) => {
    const queue = priority === 'low' ? gate.lowQueue : gate.highQueue;
    queue.push({ fn, resolve, reject });
    pump(platformId);
  });
}

function status(platformId) {
  const gate = getGate(platformId);
  return {
    cooldownActive: Date.now() < gate.cooldownUntil,
    cooldownRemainingMs: Math.max(0, gate.cooldownUntil - Date.now()),
    consecutiveFailures: gate.consecutiveFailures,
    queued: gate.highQueue.length + gate.lowQueue.length,
  };
}

module.exports = { schedule, status };
