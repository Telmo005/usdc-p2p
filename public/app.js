const REFRESH_MS = 20_000;
const STORAGE_KEY = 'p2p-corridor-state-v2';

const $ = (sel) => document.querySelector(sel);

let inFlight = false;
let refreshTimer = null;
let availableFiats = [];

const state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      balance: Number(saved.balance) > 0 ? Number(saved.balance) : 1000,
      fiatA: saved.fiatA || 'MZN',
      fiatB: saved.fiatB || 'ZAR',
      methodA: saved.methodA || '',
      methodB: saved.methodB || '',
      start: saved.start === 'b' ? 'b' : 'a',
      mode: saved.mode === 'partial' ? 'partial' : 'full',
    };
  } catch {
    return { balance: 1000, fiatA: 'MZN', fiatB: 'ZAR', methodA: '', methodB: '', start: 'a', mode: 'full' };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fmt(n, digits = 2) {
  return Number(n).toLocaleString('pt-PT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function setNode(el, amount, unit, label, isFiat) {
  el.hidden = false;
  el.innerHTML = `
    <div class="cnode-label">${label}</div>
    <div class="cnode-amount">${isFiat ? fmt(amount) : amount.toFixed(2)}</div>
    <div class="cnode-unit">${unit}</div>`;
}

function hideNode(el) {
  el.hidden = true;
}

function setCaption(el, kind, leg) {
  el.hidden = false;
  const warning = leg.fits === false ? `<div class="ccaption-warning">fora dos limites (${fmt(leg.minAmount, 0)}–${fmt(leg.maxAmount, 0)})</div>` : '';
  el.innerHTML = `
    <div class="ccaption-kind">${kind === 'buy' ? 'Taxa de compra' : 'Taxa de venda'}</div>
    <div class="ccaption-price">${fmt(leg.price, 4)}</div>
    <div class="ccaption-method">${leg.method ?? '-'} <span class="ccaption-who">· ${leg.advertiser ?? '-'}</span></div>
    ${warning}`;
}

function hideCaption(el) {
  el.hidden = true;
}

/**
 * The diagram's 4 compass positions are fixed regardless of direction:
 * N=fiatA, E=USDT bought-with-fiatA, S=fiatB, W=USDT bought-with-fiatB. What
 * changes with `start` is only which node is the anchor (start/end) and
 * which arc is the one that closes the loop back to it - the geometry
 * itself never moves.
 */
function renderCycle(data, start, mode, fiatA, fiatB) {
  const diagram = $('#cycle-diagram');
  const resultPanel = $('#result-panel');

  if (data.error) {
    // Never leave a previous successful render's numbers on screen looking
    // current when the new request actually failed - clear every node and
    // caption so it's obvious nothing here can be trusted right now.
    diagram.classList.add('has-error');
    ['#node-n', '#node-e', '#node-s', '#node-w'].forEach((sel) => hideNode($(sel)));
    ['#cap-ne', '#cap-se', '#cap-sw', '#cap-nw'].forEach((sel) => hideCaption($(sel)));
    resultPanel.innerHTML = `<p class="muted">⚠️ ${data.error}</p>`;
    return;
  }
  diagram.classList.remove('has-error');

  const legAtoUsdt = start === 'a' ? data.legA : data.legB; // buy leg using fiatA (arc N->E)
  const legUsdtToB = start === 'a' ? data.legA : data.legB; // same leg's sell half (arc E->S)
  const legBtoUsdt = start === 'a' ? data.legB : data.legA; // buy leg using fiatB (arc S->W)
  const legUsdtToA = start === 'a' ? data.legB : data.legA; // that leg's sell half (arc W->N)

  // The anchor node (whichever fiat you start with) always shows the
  // starting balance - the closed-loop final number lives in the result
  // panel below. The other fiat node always shows the real mid-point amount.
  const aAmount = start === 'a' ? data.balance : data.legA.proceeds;
  const bAmount = start === 'a' ? data.legA.proceeds : data.balance;
  const usdtFromA = legAtoUsdt.qty;
  const usdtFromB = legBtoUsdt.qty;

  const anchorLabel = mode === 'full' ? 'Começa/fecha aqui' : 'Começa aqui';
  setNode($('#node-n'), aAmount, fiatA, start === 'a' ? anchorLabel : mode === 'full' ? 'Ficas com' : 'Fica com', true);
  setNode($('#node-s'), bAmount, fiatB, start === 'b' ? anchorLabel : mode === 'full' ? 'Ficas com' : 'Fica com', true);

  $('#node-n').classList.toggle('node-anchor', start === 'a');
  $('#node-s').classList.toggle('node-anchor', start === 'b');

  const showEast = start === 'a' || mode === 'full';
  const showWest = start === 'b' || mode === 'full';

  if (showEast) {
    setNode($('#node-e'), usdtFromA, 'USDT', start === 'a' ? 'Compraste' : 'Recompraste', false);
    setCaption($('#cap-ne'), 'buy', legAtoUsdt.buy);
    setCaption($('#cap-se'), 'sell', legUsdtToB.sell);
  } else {
    hideNode($('#node-e'));
    hideCaption($('#cap-ne'));
    hideCaption($('#cap-se'));
  }

  if (showWest) {
    setNode($('#node-w'), usdtFromB, 'USDT', start === 'b' ? 'Compraste' : 'Recompraste', false);
    setCaption($('#cap-sw'), 'buy', legBtoUsdt.buy);
    setCaption($('#cap-nw'), 'sell', legUsdtToA.sell);
  } else {
    hideNode($('#node-w'));
    hideCaption($('#cap-sw'));
    hideCaption($('#cap-nw'));
  }

  // Arc visibility: in "só ida" mode only the two hops leaving the start node are drawn.
  const arcs = { ne: $('#arc-ne'), es: $('#arc-es'), sw: $('#arc-sw'), wn: $('#arc-wn') };
  const activeArcs = start === 'a' ? ['ne', 'es'] : ['sw', 'wn'];
  Object.entries(arcs).forEach(([key, el]) => {
    el.style.display = activeArcs.includes(key) || mode === 'full' ? '' : 'none';
    el.classList.remove('arc-closing');
  });
  if (mode === 'full') {
    arcs[start === 'a' ? 'wn' : 'es'].classList.add('arc-closing');
  }

  renderResultPanel(data, start, mode, fiatA, fiatB);
}

function renderResultPanel(data, start, mode, fiatA, fiatB) {
  const startUnit = start === 'a' ? fiatA : fiatB;
  const midUnit = start === 'a' ? fiatB : fiatA;

  $('#balance-start').textContent = `${fmt(data.balance)} ${startUnit}`;
  $('#balance-end').className = 'balance-box-value';

  if (mode === 'partial' || !data.legB) {
    const endAmount = data.legA.proceeds;
    $('#balance-end-box').querySelector('.balance-box-label').textContent = 'Ficas com';
    $('#balance-end').textContent = `${fmt(endAmount)} ${midUnit}`;
    $('#profit-line').innerHTML = `<span class="muted">Conversão só de ida - não há "lucro" para comparar, são moedas diferentes.</span>`;
    const impliedRate = endAmount / data.balance;
    $('#rate-line').innerHTML = `Taxa de compra efetiva: <b>1 ${startUnit} ≈ ${fmt(impliedRate, 4)} ${midUnit}</b> &nbsp;·&nbsp; Taxa de venda efetiva: <b>1 ${midUnit} ≈ ${fmt(1 / impliedRate, 4)} ${startUnit}</b>`;
    return;
  }

  $('#balance-end-box').querySelector('.balance-box-label').textContent = 'Saldo final';
  $('#balance-end').textContent = `${fmt(data.finalAmount)} ${startUnit}`;

  const positive = data.profit >= 0;
  $('#balance-end').classList.add(positive ? 'positive' : 'negative');
  $('#profit-line').innerHTML = `
    <span class="result-icon">⟲</span>
    Lucro do ciclo completo:
    <span class="result-diff ${positive ? 'positive' : 'negative'}">${positive ? '+' : ''}${fmt(data.profit)} ${startUnit} (${positive ? '+' : ''}${data.profitPct.toFixed(2)}%)</span>`;

  const buyRate = data.legA.proceeds / data.balance;
  const sellRate = data.finalAmount / data.legA.proceeds;
  $('#rate-line').innerHTML = `Taxa de compra efetiva: <b>1 ${startUnit} ≈ ${fmt(buyRate, 4)} ${midUnit}</b> &nbsp;·&nbsp; Taxa de venda efetiva: <b>1 ${midUnit} ≈ ${fmt(sellRate, 4)} ${startUnit}</b>`;
}

function currentUrl() {
  // fiatA/fiatB always match the dropdowns exactly (fiatA=N, fiatB=S in the
  // diagram) - only `start` (the actual fiat code that's the anchor) varies.
  const startFiat = state.start === 'a' ? state.fiatA : state.fiatB;
  const params = new URLSearchParams({ balance: state.balance, fiatA: state.fiatA, fiatB: state.fiatB, start: startFiat });
  if (state.methodA) params.set('methodA', state.methodA);
  if (state.methodB) params.set('methodB', state.methodB);
  return `/api/corridor?${params}`;
}

let refreshQueued = false;

async function refresh() {
  // Never silently drop a user action just because a previous request is
  // still in flight - queue exactly one follow-up run instead, using
  // whatever the state looks like BY THEN (currentUrl() is re-read fresh),
  // so a fast new request can never lose a race against a slow old one.
  if (inFlight) {
    refreshQueued = true;
    return;
  }
  inFlight = true;

  $('#status').textContent = 'a atualizar...';
  $('#status').classList.remove('error');

  try {
    const res = await fetch(currentUrl());
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'erro desconhecido');

    renderCycle(data.cycle, state.start, state.mode, state.fiatA, state.fiatB);
    $('#status').textContent = `atualizado ${new Date(data.generatedAt).toLocaleTimeString('pt-PT')}`;
  } catch (err) {
    $('#status').textContent = `falhou: ${err.message}`;
    $('#status').classList.add('error');
  } finally {
    inFlight = false;
    if (refreshQueued) {
      refreshQueued = false;
      refresh();
    }
  }
}

function scheduleAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refresh, REFRESH_MS);
}

function updateTitles() {
  $('#title-a').textContent = state.fiatA;
  $('#title-b').textContent = state.fiatB;
  document.querySelectorAll('#start-toggle .toggle-btn[data-start="a"]').forEach((b) => (b.textContent = state.fiatA));
  document.querySelectorAll('#start-toggle .toggle-btn[data-start="b"]').forEach((b) => (b.textContent = state.fiatB));
  $('#scan-anchor').textContent = state.fiatA;
}

// ---------------------------------------------------------------------------
// Scanner: try the current fiatA against several candidate fiatB's, ranked by
// the full cycle's profit% - reuses /api/corridor once per candidate, so
// there's no separate backend endpoint to keep in sync.
// ---------------------------------------------------------------------------

async function runScanner() {
  const list = $('#scan-list');
  const anchor = state.fiatA;
  const candidates = availableFiats.filter((f) => f !== anchor);
  if (!candidates.length) return;

  list.innerHTML = candidates
    .map((f) => `<div class="scan-row" data-fiat="${f}"><span class="scan-fiat">${anchor} ⇄ ${f}</span><span class="scan-status">a verificar...</span></div>`)
    .join('');

  const results = await Promise.all(
    candidates.map(async (fiatB) => {
      const row = list.querySelector(`[data-fiat="${fiatB}"]`);
      try {
        const methodParam = state.methodA ? `&methodA=${encodeURIComponent(state.methodA)}` : '';
        const res = await fetch(`/api/corridor?balance=${state.balance}&fiatA=${anchor}&fiatB=${fiatB}&start=${anchor}${methodParam}`);
        const data = await res.json();
        if (!res.ok || data.cycle.error || data.cycle.profitPct == null) {
          row.querySelector('.scan-status').textContent = data.cycle?.error ? 'sem anúncios suficientes' : 'sem dados';
          return { fiatB, profitPct: -Infinity };
        }
        const positive = data.cycle.profitPct >= 0;
        row.querySelector('.scan-status').outerHTML = `<span class="scan-pct ${positive ? 'positive' : 'negative'}">${positive ? '+' : ''}${data.cycle.profitPct.toFixed(2)}%</span>`;
        return { fiatB, profitPct: data.cycle.profitPct };
      } catch (err) {
        row.querySelector('.scan-status').textContent = `falhou`;
        return { fiatB, profitPct: -Infinity };
      }
    })
  );

  results.sort((a, b) => b.profitPct - a.profitPct);
  list.innerHTML = '';
  results.forEach((r) => {
    const isWinner = r.profitPct > -Infinity && r === results[0];
    const row = document.createElement('div');
    row.className = `scan-row ${isWinner ? 'winner' : ''} ${r.profitPct > -Infinity ? 'clickable' : ''}`;
    const positive = r.profitPct >= 0;
    const statusHtml =
      r.profitPct > -Infinity
        ? `<span class="scan-pct ${positive ? 'positive' : 'negative'}">${positive ? '+' : ''}${r.profitPct.toFixed(2)}%</span>`
        : `<span class="scan-status">sem dados</span>`;
    row.innerHTML = `<span class="scan-fiat">${anchor} ⇄ ${r.fiatB}${isWinner ? ' 🏆' : ''}</span>${statusHtml}`;
    if (r.profitPct > -Infinity) {
      row.addEventListener('click', () => {
        state.fiatB = r.fiatB;
        state.methodB = '';
        state.start = 'a';
        $('#fiat-b-select').value = r.fiatB;
        document.querySelectorAll('#start-toggle .toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.start === 'a'));
        saveState();
        updateTitles();
        loadMethods('b');
        refresh();
      });
    }
    list.appendChild(row);
  });
}

async function loadFiats() {
  const res = await fetch('/api/defaults');
  const data = await res.json();
  availableFiats = data.fiats;
  const options = availableFiats.map((f) => `<option value="${f}">${f}</option>`).join('');
  $('#fiat-a-select').innerHTML = options;
  $('#fiat-b-select').innerHTML = options;
  $('#fiat-a-select').value = state.fiatA;
  $('#fiat-b-select').value = state.fiatB;
}

/**
 * Populates the "Carteira A/B" dropdown with the real payment methods live
 * right now for that fiat - so it can never offer a wallet that doesn't
 * actually exist there (e.g. Dukascopy only ever shows up under EUR).
 */
async function loadMethods(which) {
  const fiat = which === 'a' ? state.fiatA : state.fiatB;
  const select = which === 'a' ? $('#method-a-select') : $('#method-b-select');
  const current = which === 'a' ? state.methodA : state.methodB;

  select.innerHTML = `<option value="">A carregar...</option>`;
  try {
    const res = await fetch(`/api/methods?fiat=${fiat}`);
    const data = await res.json();
    const methods = data.methods || [];
    select.innerHTML =
      `<option value="">Qualquer</option>` + methods.map((m) => `<option value="${m}">${m}</option>`).join('');
    select.value = methods.includes(current) ? current : '';
    if (which === 'a') state.methodA = select.value;
    else state.methodB = select.value;
    saveState();
  } catch {
    select.innerHTML = `<option value="">Qualquer</option>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  $('#balance-input').value = state.balance;
  document.querySelectorAll('#mode-toggle .toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.mode));
  document.querySelectorAll('#start-toggle .toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.start === state.start));

  await loadFiats();
  updateTitles();
  loadMethods('a').then(refresh);
  loadMethods('b');
  scheduleAutoRefresh();

  $('#balance-input').addEventListener('change', () => {
    state.balance = Number($('#balance-input').value) || 0;
    saveState();
    refresh();
  });

  $('#fiat-a-select').addEventListener('change', (e) => {
    state.fiatA = e.target.value;
    state.methodA = '';
    saveState();
    updateTitles();
    loadMethods('a').then(refresh);
  });

  $('#fiat-b-select').addEventListener('change', (e) => {
    state.fiatB = e.target.value;
    state.methodB = '';
    saveState();
    updateTitles();
    loadMethods('b').then(refresh);
  });

  $('#method-a-select').addEventListener('change', (e) => {
    state.methodA = e.target.value;
    saveState();
    refresh();
  });

  $('#method-b-select').addEventListener('change', (e) => {
    state.methodB = e.target.value;
    saveState();
    refresh();
  });

  document.querySelectorAll('#start-toggle .toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.start === state.start) return;
      state.start = btn.dataset.start;
      document.querySelectorAll('#start-toggle .toggle-btn').forEach((b) => b.classList.toggle('active', b === btn));
      saveState();
      refresh();
    });
  });

  document.querySelectorAll('#mode-toggle .toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === state.mode) return;
      state.mode = btn.dataset.mode;
      document.querySelectorAll('#mode-toggle .toggle-btn').forEach((b) => b.classList.toggle('active', b === btn));
      saveState();
      refresh();
    });
  });

  $('#scan-btn').addEventListener('click', runScanner);

  // A backgrounded tab gains nothing from polling - pause while hidden, catch up instantly when it's visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (refreshTimer) clearInterval(refreshTimer);
    } else {
      refresh();
      scheduleAutoRefresh();
    }
  });
});
