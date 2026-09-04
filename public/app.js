const REFRESH_MS = 20_000;
const STORAGE_KEY = 'p2p-corridor-state-v2';

const FIAT_INFO = {
  MZN: { flag: '🇲🇿', name: 'Metical' },
  ZAR: { flag: '🇿🇦', name: 'Rand' },
  USD: { flag: '🇺🇸', name: 'Dólar Americano' },
  EUR: { flag: '🇪🇺', name: 'Euro' },
  GBP: { flag: '🇬🇧', name: 'Libra Esterlina' },
  KES: { flag: '🇰🇪', name: 'Xelim Queniano' },
  NGN: { flag: '🇳🇬', name: 'Naira' },
  BRL: { flag: '🇧🇷', name: 'Real Brasileiro' },
};

const $ = (sel) => document.querySelector(sel);

let inFlight = false;
let refreshTimer = null;
let availableFiats = [];
let availableExchanges = []; // [{id, name}], loaded from /api/defaults
let lastCycleData = null; // last successful cycle response, so the ad picker can read its candidates

// Manual ad overrides, keyed 'buyA' | 'sellA' | 'buyB' | 'sellB' (server's leg
// naming - always "the leg starting from balance" / "the leg closing it",
// regardless of which UI fiat that currently is). Not persisted: an advNo
// only stays valid for a few minutes, so resurrecting a pin from a past
// session would almost always just silently miss anyway - clearing on
// reload is the honest behavior.
let pins = {};

function clearPins() {
  pins = {};
}

const state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      balance: Number(saved.balance) > 0 ? Number(saved.balance) : 1000,
      fiatA: saved.fiatA || 'MZN',
      fiatB: saved.fiatB || 'ZAR',
      methodA: Array.isArray(saved.methodA) ? saved.methodA : [],
      methodB: Array.isArray(saved.methodB) ? saved.methodB : [],
      // Empty means "every exchange" - same convention as methodA/B.
      exchanges: Array.isArray(saved.exchanges) ? saved.exchanges : [],
      start: saved.start === 'b' ? 'b' : 'a',
      mode: saved.mode === 'partial' ? 'partial' : 'full',
    };
  } catch {
    return { balance: 1000, fiatA: 'MZN', fiatB: 'ZAR', methodA: [], methodB: [], exchanges: [], start: 'a', mode: 'full' };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fmt(n, digits = 2) {
  return Number(n).toLocaleString('pt-PT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * Always quotes a rate as "1 <forte> ≈ X <fraca>", regardless of which fiat
 * happens to be the cycle's start/mid - a rate like "1 MZN ≈ 0,22 ZAR" forces
 * you to read a sub-1 fraction, while "1 ZAR ≈ 4,59 MZN" is the natural way
 * anyone actually reads an exotic-currency rate. Strength is derived from the
 * live market itself (whichever fiat costs fewer units per USDT), not a
 * hardcoded list, so it holds for any pair the app supports.
 */
function orientRates(startUnit, midUnit, startPerUsdt, midPerUsdt, startToMid, midToStart) {
  const startIsStrong = startPerUsdt <= midPerUsdt;
  return {
    strongUnit: startIsStrong ? startUnit : midUnit,
    weakUnit: startIsStrong ? midUnit : startUnit,
    compra: startIsStrong ? startToMid : 1 / startToMid,
    venda: startIsStrong ? 1 / midToStart : midToStart,
  };
}

/** `legKey`/`sideKey`, when given, mean this node's amount comes straight from that leg's ad - clicking it opens the same picker as its neighboring rate box. The anchor node (your starting balance) has no ad behind it, so it's left non-interactive. */
function setNode(el, amount, unit, label, isFiat, legKey, sideKey) {
  el.hidden = false;
  const clickable = !!legKey;
  el.classList.toggle('is-clickable', clickable);
  if (clickable) {
    el.dataset.legKey = legKey;
    el.dataset.sideKey = sideKey;
  } else {
    delete el.dataset.legKey;
    delete el.dataset.sideKey;
  }
  el.innerHTML = `
    <div class="cnode-label">${label}</div>
    <div class="cnode-amount">${isFiat ? fmt(amount) : amount.toFixed(2)}</div>
    <div class="cnode-unit">${unit}</div>`;
}

function hideNode(el) {
  el.hidden = true;
}

const PLATFORM_CLASS = { Binance: 'plat-binance', Bybit: 'plat-bybit', OKX: 'plat-okx' };

/** `legKey`/`sideKey` ('A'|'B', 'buy'|'sell') identify which pin this box's click should set - stashed as data attrs so the click handler doesn't have to recompute the start-dependent mapping. */
function setCaption(el, kind, leg, num, legKey, sideKey) {
  el.hidden = false;
  el.dataset.legKey = legKey;
  el.dataset.sideKey = sideKey;
  el.classList.toggle('is-manual', !!leg.manual);
  const warning = leg.fits === false ? `<div class="ccaption-warning">fora dos limites (${fmt(leg.minAmount, 0)}–${fmt(leg.maxAmount, 0)})</div>` : '';
  const platformTag = leg.platform ? `<span class="ccaption-platform ${PLATFORM_CLASS[leg.platform] || ''}">${leg.platform}</span>` : '';
  const manualTag = leg.manual ? `<div class="ccaption-manual-tag">escolhido à mão</div>` : '';
  el.innerHTML = `
    <span class="badge-num">${num}</span>
    ${platformTag}
    <div class="ccaption-kind">${kind === 'buy' ? 'Taxa de compra' : 'Taxa de venda'}</div>
    <div class="ccaption-price">${fmt(leg.price, 4)}</div>
    <div class="ccaption-method">${leg.method ?? '-'} <span class="ccaption-who">· ${leg.advertiser ?? '-'}</span></div>
    ${manualTag}
    ${warning}`;
}

function hideCaption(el) {
  el.hidden = true;
}

const PIN_KEY = { A: { buy: 'buyA', sell: 'sellA' }, B: { buy: 'buyB', sell: 'sellB' } };
const KIND_LABEL = { buy: 'Taxa de compra', sell: 'Taxa de venda' };

/** Opens the ad picker for one leg/side, listing every reputable candidate the last successful cycle response saw for it (plus "Automático" to clear a pin). */
function openAdPicker(legKey, sideKey) {
  if (!lastCycleData) return;
  const leg = legKey === 'A' ? lastCycleData.legA : lastCycleData.legB;
  const info = leg?.[sideKey];
  if (!info) return;

  const pinField = PIN_KEY[legKey][sideKey];
  const currentPin = pins[pinField];

  $('#ad-picker-title').textContent = `${KIND_LABEL[sideKey]} · escolher anúncio`;

  const rows = [
    `<button type="button" class="ad-picker-row auto ${!currentPin ? 'active' : ''}" data-auto="1">
      <span class="apr-price">Auto</span>
      <span class="apr-details"><span class="apr-method">Automático (melhor preço que caiba no valor)</span></span>
    </button>`,
    ...info.candidates.map((c) => {
      const isActive = !!currentPin && currentPin.platform === c.platform && String(currentPin.advNo) === String(c.advNo);
      const platformClass = PLATFORM_CLASS[c.platformName] || '';
      return `<button type="button" class="ad-picker-row ${isActive ? 'active' : ''}" data-platform="${c.platform}" data-advno="${c.advNo}">
        <span class="apr-price">${fmt(c.price, 4)}</span>
        <span class="apr-platform ${platformClass}">${c.platformName}</span>
        <span class="apr-details">
          <span class="apr-method">${c.method ?? '-'}</span>
          <span class="apr-adv">${c.advertiser ?? '-'} · ${fmt(c.minAmount, 0)}–${fmt(c.maxAmount, 0)}</span>
        </span>
      </button>`;
    }),
  ];

  $('#ad-picker-list').innerHTML = rows.join('');
  $('#ad-picker-list').querySelectorAll('.ad-picker-row').forEach((row) => {
    row.addEventListener('click', () => {
      if (row.dataset.auto) {
        delete pins[pinField];
      } else {
        pins[pinField] = { platform: row.dataset.platform, advNo: row.dataset.advno };
      }
      closeAdPicker();
      refresh();
    });
  });

  $('#ad-picker-overlay').hidden = false;
}

function closeAdPicker() {
  $('#ad-picker-overlay').hidden = true;
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
    $('#cycle-center-card').hidden = true;
    $('#stat-row').hidden = true;
    resultPanel.innerHTML = `<p class="muted">⚠️ ${data.error}</p>`;
    return;
  }
  diagram.classList.remove('has-error');
  lastCycleData = data;

  const legAKey = start === 'a' ? 'A' : 'B'; // which server leg (legA/legB) the N->E->S half of the diagram is right now
  const legBKey = start === 'a' ? 'B' : 'A'; // and the S->W->N half
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
  // Whichever of N/S isn't the anchor always shows data.legA's proceeds -
  // that's what ties it to (legKey 'A', 'sell') regardless of which UI fiat it is.
  setNode($('#node-n'), aAmount, fiatA, start === 'a' ? anchorLabel : mode === 'full' ? 'Ficas com' : 'Fica com', true, start === 'a' ? null : 'A', start === 'a' ? null : 'sell');
  setNode($('#node-s'), bAmount, fiatB, start === 'b' ? anchorLabel : mode === 'full' ? 'Ficas com' : 'Fica com', true, start === 'b' ? null : 'A', start === 'b' ? null : 'sell');

  $('#node-n').classList.toggle('node-anchor', start === 'a');
  $('#node-s').classList.toggle('node-anchor', start === 'b');

  const showEast = start === 'a' || mode === 'full';
  const showWest = start === 'b' || mode === 'full';

  if (showEast) {
    setNode($('#node-e'), usdtFromA, 'USDT', start === 'a' ? 'Compraste' : 'Recompraste', false, legAKey, 'buy');
    setCaption($('#cap-ne'), 'buy', legAtoUsdt.buy, 1, legAKey, 'buy');
    setCaption($('#cap-se'), 'sell', legUsdtToB.sell, 2, legAKey, 'sell');
  } else {
    hideNode($('#node-e'));
    hideCaption($('#cap-ne'));
    hideCaption($('#cap-se'));
  }

  if (showWest) {
    setNode($('#node-w'), usdtFromB, 'USDT', start === 'b' ? 'Compraste' : 'Recompraste', false, legBKey, 'buy');
    setCaption($('#cap-sw'), 'buy', legBtoUsdt.buy, 3, legBKey, 'buy');
    setCaption($('#cap-nw'), 'sell', legUsdtToA.sell, 4, legBKey, 'sell');
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
  const resultPanel = $('#result-panel');

  if (mode === 'partial' || !data.legB) {
    $('#cycle-center-card').hidden = true;
    $('#stat-row').hidden = true;

    const endAmount = data.legA.proceeds;
    const impliedRate = endAmount / data.balance;
    const { strongUnit, weakUnit, compra, venda } = orientRates(startUnit, midUnit, data.legA.buy.price, data.legA.sell.price, impliedRate, 1 / impliedRate);
    resultPanel.innerHTML = `
      <p class="muted">Conversão só de ida: ${fmt(data.balance)} ${startUnit} → <b>${fmt(endAmount)} ${midUnit}</b>. Não há "lucro" para comparar, são moedas diferentes.</p>
      <p class="rate-line">Taxa de compra efetiva: <b>1 ${strongUnit} ≈ ${fmt(compra, 4)} ${weakUnit}</b> &nbsp;·&nbsp; Taxa de venda efetiva: <b>1 ${strongUnit} ≈ ${fmt(venda, 4)} ${weakUnit}</b></p>`;
    return;
  }

  resultPanel.innerHTML = '';
  $('#cycle-center-card').hidden = false;
  $('#stat-row').hidden = false;

  const positive = data.profit >= 0;
  const sign = positive ? '+' : '';
  const cls = positive ? 'positive' : 'negative';

  // USDT trades close to 1:1 with USD, so the anchor leg's own buy rate
  // (fiat per USDT) doubles as a fiat-per-USD proxy - no separate FX lookup needed.
  const profitUsd = data.profit / data.legA.buy.price;

  $('#center-card-label').textContent = 'Lucro estimado';
  $('#center-profit').textContent = `${sign}${fmt(data.profit)} ${startUnit}`;
  $('#center-profit').className = `center-card-value ${cls}`;
  $('#center-profit-usd').textContent = `${sign}${data.profitPct.toFixed(2)}% · ${sign}${fmt(profitUsd)} USD (aprox.)`;
  $('#center-profit-usd').className = `center-card-usd ${cls}`;

  $('#stat-investment').textContent = `${fmt(data.balance)} ${startUnit}`;
  $('#stat-profit').textContent = `${sign}${fmt(data.profit)} ${startUnit}`;
  $('#stat-profit').className = `stat-value ${cls}`;
  $('#stat-profit-pct').textContent = `${sign}${data.profitPct.toFixed(2)}%`;
  $('#stat-profit-pct').className = `stat-value ${cls}`;
  $('#stat-profit-usd').textContent = `${sign}${fmt(profitUsd)} USD`;
  $('#stat-profit-usd').className = `stat-value ${cls}`;

  const buyRate = data.legA.proceeds / data.balance;
  const sellRate = data.finalAmount / data.legA.proceeds;
  const { strongUnit, weakUnit, compra, venda } = orientRates(startUnit, midUnit, data.legA.buy.price, data.legA.sell.price, buyRate, sellRate);
  resultPanel.innerHTML = `<p class="rate-line">Taxa de compra efetiva: <b>1 ${strongUnit} ≈ ${fmt(compra, 4)} ${weakUnit}</b> &nbsp;·&nbsp; Taxa de venda efetiva: <b>1 ${strongUnit} ≈ ${fmt(venda, 4)} ${weakUnit}</b></p>`;
}

function currentUrl() {
  // fiatA/fiatB always match the dropdowns exactly (fiatA=N, fiatB=S in the
  // diagram) - only `start` (the actual fiat code that's the anchor) varies.
  const startFiat = state.start === 'a' ? state.fiatA : state.fiatB;
  const params = new URLSearchParams({ balance: state.balance, fiatA: state.fiatA, fiatB: state.fiatB, start: startFiat });
  if (state.methodA.length) params.set('methodA', state.methodA.join(','));
  if (state.methodB.length) params.set('methodB', state.methodB.join(','));
  if (state.exchanges.length) params.set('exchanges', state.exchanges.join(','));
  if (pins.buyA) params.set('pickLegABuy', `${pins.buyA.platform}:${pins.buyA.advNo}`);
  if (pins.sellA) params.set('pickLegASell', `${pins.sellA.platform}:${pins.sellA.advNo}`);
  if (pins.buyB) params.set('pickLegBBuy', `${pins.buyB.platform}:${pins.buyB.advNo}`);
  if (pins.sellB) params.set('pickLegBSell', `${pins.sellB.platform}:${pins.sellB.advNo}`);
  return `/api/corridor?${params}`;
}

let refreshQueued = false;

async function refresh() {
  updateClearFiltersButton();

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
    $('#status').textContent = 'atualizado agora';
    const generated = new Date(data.generatedAt);
    $('#updated-time').textContent = generated.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }) + ' ' + generated.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
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
  $('#cycle-subtitle').textContent = `Veja o ciclo completo de arbitragem entre ${state.fiatA} e ${state.fiatB}`;
  updateBalanceBadge();
}

// The balance is always denominated in whichever fiat is the current anchor
// (`start`), not necessarily fiatA - the badge next to the amount must track that.
function updateBalanceBadge() {
  const startCode = state.start === 'a' ? state.fiatA : state.fiatB;
  const info = FIAT_INFO[startCode] || { flag: '🏳️', name: startCode };
  $('#fiat-a-flag').textContent = info.flag;
  $('#fiat-a-code').textContent = startCode;
  $('#fiat-a-name').textContent = info.name;
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
        const methodParam = state.methodA.length ? `&methodA=${encodeURIComponent(state.methodA.join(','))}` : '';
        const exchangeParam = state.exchanges.length ? `&exchanges=${encodeURIComponent(state.exchanges.join(','))}` : '';
        const res = await fetch(`/api/corridor?balance=${state.balance}&fiatA=${anchor}&fiatB=${fiatB}&start=${anchor}${methodParam}${exchangeParam}`);
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
        state.methodB = [];
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
  availableExchanges = data.exchanges || [];
  const options = availableFiats.map((f) => `<option value="${f}">${f}</option>`).join('');
  $('#fiat-a-select').innerHTML = options;
  $('#fiat-b-select').innerHTML = options;
  $('#fiat-a-select').value = state.fiatA;
  $('#fiat-b-select').value = state.fiatB;
}

/** Updates the "Carteira A/B" trigger button label to reflect how many wallets are selected. */
function updateMethodTrigger(which) {
  const selected = which === 'a' ? state.methodA : state.methodB;
  const trigger = $(`#method-${which}-trigger`);
  trigger.textContent = selected.length === 0 ? 'Qualquer' : selected.length === 1 ? selected[0] : `${selected.length} selecionadas`;
  trigger.classList.toggle('has-selection', selected.length > 0);
}

/** Any open "Carteira A/B" or "Exchanges" panel - closing all of them before opening one keeps at most one on screen at a time. */
function closeAllMultiselects() {
  document.querySelectorAll('.multiselect-panel').forEach((p) => (p.hidden = true));
}

function toggleMultiselect(panelId) {
  const panel = $(`#${panelId}`);
  const wasOpen = !panel.hidden;
  closeAllMultiselects();
  panel.hidden = wasOpen;
}

/** Updates the "Exchanges" trigger button label to reflect the current selection ([] means every exchange). */
function updateExchangeTrigger() {
  const trigger = $('#exchange-trigger');
  const n = state.exchanges.length;
  const name = (id) => availableExchanges.find((e) => e.id === id)?.name || id;
  trigger.textContent = n === 0 ? 'Todas' : n === 1 ? name(state.exchanges[0]) : `${n} selecionadas`;
  trigger.classList.toggle('has-selection', n > 0);
}

/** Renders the "Exchanges" checkbox panel from /api/defaults' exchange list - never hardcoded, so a future platform just shows up. */
function renderExchangeOptions() {
  const panel = $('#exchange-panel');
  if (!availableExchanges.length) {
    panel.innerHTML = `<div class="ms-empty">Sem exchanges</div>`;
    return;
  }

  panel.innerHTML = availableExchanges
    .map(
      ({ id, name }) =>
        `<label class="ms-option"><input type="checkbox" value="${id}" ${state.exchanges.length === 0 || state.exchanges.includes(id) ? 'checked' : ''}/> ${name}</label>`
    )
    .join('');

  panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const checked = [...panel.querySelectorAll('input[type="checkbox"]:checked')].map((i) => i.value);
      if (checked.length === 0) {
        // Never allow zero exchanges - that's not a narrower filter, it's no data at all.
        cb.checked = true;
        return;
      }
      state.exchanges = checked.length === availableExchanges.length ? [] : checked;
      clearPins();
      updateExchangeTrigger();
      saveState();
      loadMethods('a');
      loadMethods('b');
      refresh();
    });
  });

  updateExchangeTrigger();
}

/**
 * Populates the "Carteira A/B" checkbox panel with the real payment methods
 * live right now for that fiat - so it can never offer a wallet that doesn't
 * actually exist there (e.g. Dukascopy only ever shows up under EUR). Several
 * can be checked at once: the corridor then accepts an ad using ANY of them.
 */
async function loadMethods(which) {
  const fiat = which === 'a' ? state.fiatA : state.fiatB;
  const panel = $(`#method-${which}-panel`);

  panel.innerHTML = `<div class="ms-empty">A carregar...</div>`;
  try {
    const res = await fetch(`/api/methods?fiat=${fiat}`);
    const data = await res.json();
    const methods = data.methods || [];

    // Drop any previously-checked method that no longer exists for this fiat
    // (e.g. after switching moeda) instead of silently keeping a stale filter.
    const selected = (which === 'a' ? state.methodA : state.methodB).filter((m) => methods.includes(m));
    if (which === 'a') state.methodA = selected;
    else state.methodB = selected;

    panel.innerHTML = methods.length
      ? methods
          .map(
            (m) =>
              `<label class="ms-option"><input type="checkbox" value="${m}" ${selected.includes(m) ? 'checked' : ''}/> ${m}</label>`
          )
          .join('')
      : `<div class="ms-empty">Sem métodos disponíveis</div>`;

    panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const set = new Set(which === 'a' ? state.methodA : state.methodB);
        if (cb.checked) set.add(cb.value);
        else set.delete(cb.value);
        if (which === 'a') state.methodA = [...set];
        else state.methodB = [...set];
        clearPins();
        updateMethodTrigger(which);
        saveState();
        refresh();
      });
    });

    updateMethodTrigger(which);
    saveState();
  } catch {
    panel.innerHTML = `<div class="ms-empty">Falha ao carregar</div>`;
  }
}

function hasActiveFilters() {
  return state.methodA.length > 0 || state.methodB.length > 0 || state.exchanges.length > 0 || Object.keys(pins).length > 0;
}

function updateClearFiltersButton() {
  $('#clear-filters-btn').hidden = !hasActiveFilters();
}

/** Resets every filter (carteiras, exchanges, manual ad pins) back to "sem restrições" in one go. */
function clearAllFilters() {
  state.methodA = [];
  state.methodB = [];
  state.exchanges = [];
  clearPins();
  saveState();
  closeAllMultiselects();
  updateExchangeTrigger();
  renderExchangeOptions();
  Promise.all([loadMethods('a'), loadMethods('b')]).then(refresh);
}

document.addEventListener('DOMContentLoaded', async () => {
  $('#balance-input').value = state.balance;
  document.querySelectorAll('#mode-toggle .toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.mode));
  document.querySelectorAll('#start-toggle .toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.start === state.start));

  await loadFiats();
  updateTitles();
  renderExchangeOptions();
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
    state.methodA = [];
    clearPins();
    saveState();
    updateTitles();
    loadMethods('a').then(refresh);
  });

  $('#fiat-b-select').addEventListener('change', (e) => {
    state.fiatB = e.target.value;
    state.methodB = [];
    clearPins();
    saveState();
    updateTitles();
    loadMethods('b').then(refresh);
  });

  $('#method-a-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMultiselect('method-a-panel');
  });

  $('#method-b-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMultiselect('method-b-panel');
  });

  $('#exchange-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMultiselect('exchange-panel');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.multiselect')) closeAllMultiselects();
  });

  document.querySelectorAll('#start-toggle .toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.start === state.start) return;
      state.start = btn.dataset.start;
      document.querySelectorAll('#start-toggle .toggle-btn').forEach((b) => b.classList.toggle('active', b === btn));
      clearPins();
      saveState();
      updateBalanceBadge();
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

  $('#swap-btn').addEventListener('click', () => {
    [state.fiatA, state.fiatB] = [state.fiatB, state.fiatA];
    [state.methodA, state.methodB] = [state.methodB, state.methodA];
    $('#fiat-a-select').value = state.fiatA;
    $('#fiat-b-select').value = state.fiatB;
    clearPins();
    saveState();
    updateTitles();
    closeAllMultiselects();
    Promise.all([loadMethods('a'), loadMethods('b')]).then(refresh);
  });

  $('#scan-btn').addEventListener('click', runScanner);

  $('#clear-filters-btn').addEventListener('click', clearAllFilters);

  $('#cycle-diagram').addEventListener('click', (e) => {
    const target = e.target.closest('.ccaption, .cnode');
    if (!target || target.hidden || !target.dataset.legKey) return;
    openAdPicker(target.dataset.legKey, target.dataset.sideKey);
  });

  $('#ad-picker-close').addEventListener('click', closeAdPicker);
  $('#ad-picker-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'ad-picker-overlay') closeAdPicker();
  });

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
