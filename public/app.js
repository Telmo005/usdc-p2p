const STORAGE_KEY = 'p2p-watch-selection';
const THEME_KEY = 'p2p-watch-theme';

const $ = (sel) => document.querySelector(sel);

const state = loadSelection();
let platformsCatalog = [];
let currentMethods = []; // [{name, fiats:[{fiat,count}]}] - whole-platform catalog, independent of the current fiat
let methodSearchTerm = '';
let fiatOnlyMethods = false; // when true, the method grid only shows methods active in state.fiat
let methodsCatalogKey = null; // `${platform}:${asset}` the catalog above was fetched for
let lastBook = null; // last {buy, sell} response, reused for client-side gain recompute
let refreshTimer = null;

// A row the user clicked to pin as "use exactly this ad" for the gain
// calculation, instead of the automatic best-fit-for-my-amount pick. Cleared
// whenever the market changes, since a pinned price from a different market
// is meaningless.
const selection = { buy: null, sell: null };

function loadSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      platform: saved.platform || 'binance',
      fiat: saved.fiat || 'MZN',
      asset: saved.asset || 'USDT',
      methods: Array.isArray(saved.methods) ? saved.methods : [],
      favoriteMethods: Array.isArray(saved.favoriteMethods) ? saved.favoriteMethods : [],
      amount: Number(saved.amount) > 0 ? Number(saved.amount) : 1000,
      amountMode: saved.amountMode === 'crypto' ? 'crypto' : 'fiat',
      feePct: Number(saved.feePct) >= 0 ? Number(saved.feePct) : 0,
      refreshMs: [5000, 15000, 30000, 60000].includes(Number(saved.refreshMs)) ? Number(saved.refreshMs) : 15000,
      alertsEnabled: !!saved.alertsEnabled,
      alertsThreshold: Number(saved.alertsThreshold) >= 0 ? Number(saved.alertsThreshold) : 2,
    };
  } catch {
    return {
      platform: 'binance',
      fiat: 'MZN',
      asset: 'USDT',
      methods: [],
      favoriteMethods: [],
      amount: 1000,
      amountMode: 'fiat',
      feePct: 0,
      refreshMs: 15000,
      alertsEnabled: false,
      alertsThreshold: 2,
    };
  }
}

function saveSelection() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fmtPrice(n) {
  return Number(n).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtMoney(n) {
  return Number(n).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtAmount(n) {
  return Number(n).toLocaleString('pt-PT', { maximumFractionDigits: 0 });
}

function timeAgo(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'agora mesmo';
  if (s < 60) return `há ${s}s`;
  return `há ${Math.round(s / 60)}min`;
}

// ---------------------------------------------------------------------------
// Setup: platforms + fiat/asset suggestions
// ---------------------------------------------------------------------------

async function loadStaticData() {
  const [platformsRes, defaultsRes] = await Promise.all([
    fetch('/api/platforms').then((r) => r.json()),
    fetch('/api/defaults').then((r) => r.json()),
  ]);

  platformsCatalog = platformsRes;
  renderPlatformPicker();

  $('#fiat-suggestions').innerHTML = defaultsRes.fiats.map((f) => `<option value="${f}">`).join('');
  $('#asset-suggestions').innerHTML = defaultsRes.assets.map((a) => `<option value="${a}">`).join('');
  $('#fiat-input').value = state.fiat;
  $('#asset-input').value = state.asset;
  $('#amount-input').value = state.amount;
  renderAmountMode();
}

/** Keeps the "Dinheiro/Cripto" toggle and the unit shown next to the amount input in sync with state. */
function renderAmountMode() {
  document.querySelectorAll('#amount-mode-toggle .mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === state.amountMode);
  });
  $('#amount-unit').textContent = state.amountMode === 'crypto' ? state.asset : state.fiat;
}

function renderPlatformPicker() {
  const el = $('#platform-picker');
  el.innerHTML = platformsCatalog
    .map((p) => `<button type="button" class="${p.id === state.platform ? 'active' : ''}" data-platform="${p.id}">${p.label}</button>`)
    .join('');
  el.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.platform === state.platform) return;
      state.platform = btn.dataset.platform;
      state.methods = []; // method names aren't comparable across platforms
      clearSelection();
      saveSelection();
      renderPlatformPicker();
      refreshMethods();
      refreshBook();
      refreshCompare();
      updateClearButtonVisibility();
    });
  });
}

// ---------------------------------------------------------------------------
// Payment methods: the full catalog for this platform+asset, across every
// candidate fiat - so a method is never invisible just because it happens to
// be inactive in whichever fiat is currently typed into the box.
// ---------------------------------------------------------------------------

async function refreshMethods() {
  const key = `${state.platform}:${state.asset}`;
  const el = $('#methods-picker');
  el.innerHTML = `<span class="muted">a escanear os métodos desta plataforma (pode levar ~20-30s, procura em vários mercados)...</span>`;
  $('#methods-depth-note').textContent = '';

  try {
    const res = await fetch(`/api/methods?platform=${state.platform}&asset=${state.asset}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'erro');

    currentMethods = data.methods;
    methodsCatalogKey = key;
    // Drop selected methods that don't exist anywhere on this platform+asset at all,
    // then auto-apply any favorite that does exist here - favorites are meant to
    // "always be on" whenever you land on a new market, not just where you set them.
    const validNow = state.methods.filter((m) => currentMethods.some((cm) => cm.name === m));
    const favoritesHere = state.favoriteMethods.filter((m) => currentMethods.some((cm) => cm.name === m));
    state.methods = [...new Set([...validNow, ...favoritesHere])];
    saveSelection();
    renderMethods();
    updateClearButtonVisibility();
    renderBestAssetHint();

    $('#methods-depth-note').textContent = `${currentMethods.length} métodos em ${data.fiatsScanned.length} mercados (${data.fiatsScanned.join(', ')})`;
  } catch (err) {
    el.innerHTML = `<span class="muted">Não foi possível carregar métodos: ${err.message}</span>`;
  }
}

function renderMethods() {
  const el = $('#methods-picker');
  $('#fiat-only-code').textContent = state.fiat;
  $('#fiat-only-toggle').classList.toggle('active', fiatOnlyMethods);

  if (!currentMethods.length) {
    el.innerHTML = `<span class="muted">Sem métodos de pagamento ativos nesta plataforma agora.</span>`;
    return;
  }

  const term = methodSearchTerm.trim().toLowerCase();
  let visible = term ? currentMethods.filter((m) => m.name.toLowerCase().includes(term)) : currentMethods;
  if (fiatOnlyMethods) visible = visible.filter((m) => m.fiats.some((f) => f.fiat === state.fiat));

  if (!visible.length) {
    const reason = fiatOnlyMethods ? `em ${state.fiat}` : `"${methodSearchTerm}"`;
    el.innerHTML = `<span class="muted">Nenhum método corresponde a ${reason}.</span>`;
    return;
  }

  el.innerHTML = visible
    .map((m) => {
      const active = state.methods.includes(m.name);
      const favorited = state.favoriteMethods.includes(m.name);
      const fiatsHtml = m.fiats
        .map(
          (f) =>
            `<button type="button" class="fiat-tag ${f.fiat === state.fiat ? 'current' : ''}" data-method="${m.name}" data-fiat="${f.fiat}">${f.fiat} ${f.count}</button>`
        )
        .join('');
      return `
        <div class="method-card ${active ? 'active' : ''}">
          <div class="method-card-head">
            <button type="button" class="method-name" data-method="${m.name}" title="${m.name}">${m.name}</button>
            <button type="button" class="favorite-star ${favorited ? 'favorited' : ''}" data-method="${m.name}" title="${favorited ? 'Remover dos favoritos' : 'Marcar como favorito'}">${favorited ? '★' : '☆'}</button>
          </div>
          <div class="method-fiats">${fiatsHtml}</div>
        </div>`;
    })
    .join('');

  el.querySelectorAll('.method-name').forEach((btn) => {
    btn.addEventListener('click', () => toggleMethod(btn.dataset.method));
  });
  el.querySelectorAll('.favorite-star').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavoriteMethod(btn.dataset.method);
    });
  });
  el.querySelectorAll('.fiat-tag').forEach((btn) => {
    btn.addEventListener('click', () => activateMethodInFiat(btn.dataset.method, btn.dataset.fiat));
  });
}

/** Favorites are permanent (persisted, auto-applied on every new market) - distinct from the ad-hoc "active this session" filter set by clicking the name. */
function toggleFavoriteMethod(name) {
  if (state.favoriteMethods.includes(name)) {
    state.favoriteMethods = state.favoriteMethods.filter((m) => m !== name);
  } else {
    state.favoriteMethods = [...state.favoriteMethods, name];
    if (!state.methods.includes(name)) state.methods = [...state.methods, name];
  }
  saveSelection();
  renderMethods();
  refreshBook();
  updateClearButtonVisibility();
  renderBestAssetHint();
}

function toggleMethod(name) {
  if (state.methods.includes(name)) {
    state.methods = state.methods.filter((m) => m !== name);
    saveSelection();
    renderMethods();
    refreshBook();
    updateClearButtonVisibility();
    return;
  }

  const entry = currentMethods.find((m) => m.name === name);
  const availableHere = entry?.fiats.some((f) => f.fiat === state.fiat);
  const bestFiat = entry?.fiats[0]?.fiat; // fiat with the most active ads for this method
  activateMethodInFiat(name, availableHere ? state.fiat : bestFiat);
}

/** Selects a method as an active filter and, if needed, jumps to the fiat where it actually has ads. */
function activateMethodInFiat(name, fiat) {
  if (!state.methods.includes(name)) state.methods = [...state.methods, name];

  if (fiat && fiat !== state.fiat) {
    state.fiat = fiat;
    $('#fiat-input').value = fiat;
    clearSelection();
    renderAmountMode(); // the fiat unit shown next to "Tenho: Dinheiro" must follow the jump too
  }

  saveSelection();
  renderMethods();
  refreshBook();
  updateClearButtonVisibility();
}

// ---------------------------------------------------------------------------
// Order book
// ---------------------------------------------------------------------------

function isRowSelected(side, ad) {
  const sel = selection[side];
  return !!sel && sel.price === ad.price && sel.advertiser === ad.advertiser;
}

function renderAdRow(ad, side) {
  const selected = isRowSelected(side, ad);
  const repParts = [];
  if (ad.finishRate != null) repParts.push(`${Math.round(ad.finishRate * 100)}% concluído`);
  if (ad.orderCount != null) repParts.push(`${ad.orderCount} ordens`);
  if (ad.payTimeLimit) repParts.push(`${ad.payTimeLimit} min p/ pagar`);
  const repLine = repParts.length ? `<span class="ad-rep">${repParts.join(' · ')}</span>` : '';

  return `
    <div class="ad-row ${side} ${selected ? 'selected' : ''}" data-side="${side}" data-price="${ad.price}" data-advertiser="${ad.advertiser ?? ''}">
      <span class="ad-price">${fmtPrice(ad.price)} ${state.fiat}</span>
      <span class="ad-advertiser">${ad.advertiser ?? '-'}</span>
      <span class="ad-methods">${ad.methods.join(' · ')}</span>
      <span class="ad-limits">${fmtAmount(ad.minAmount)}–${fmtAmount(ad.maxAmount)} ${state.fiat}</span>
      ${repLine}
    </div>`;
}

function renderList(container, ads, side, emptyMsg) {
  if (!ads.length) {
    container.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
    return;
  }
  container.innerHTML = ads.map((ad) => renderAdRow(ad, side)).join('');

  container.querySelectorAll('.ad-row').forEach((row, i) => {
    row.addEventListener('click', () => {
      const ad = ads[i];
      // Clicking an already-selected row un-pins it, back to automatic mode.
      const already = isRowSelected(side, ad);
      selection[side] = already ? null : ad;
      renderList(container, ads, side, emptyMsg);
      computeAndRenderGain();
      updateClearButtonVisibility();
    });
  });
}

function clearSelection() {
  selection.buy = null;
  selection.sell = null;
}

/** Shows/hides the header's "Limpar seleção" button - only worth showing when there's actually something to clear. */
function updateClearButtonVisibility() {
  const hasSomething = state.methods.length > 0 || !!selection.buy || !!selection.sell || !!methodSearchTerm || fiatOnlyMethods;
  $('#clear-selection-btn').hidden = !hasSomething;
}

/** Resets every filter/pin the user has made (methods, search text, pinned buy/sell rows) - not platform/fiat/asset/amount, those are settings, not a "selection". */
function clearAllSelections() {
  state.methods = [];
  methodSearchTerm = '';
  fiatOnlyMethods = false;
  $('#method-search').value = '';
  clearSelection();
  saveSelection();
  renderMethods();
  refreshBook();
  updateClearButtonVisibility();
}

// Cancels whatever /api/book request is still pending the moment a newer one
// is needed - e.g. the user clicks through methods/fiats faster than the
// deep search can finish. Without this, an old, slow, now-irrelevant response
// could still land after a newer one and clobber the screen with stale data,
// and it'd keep occupying a rateGate slot for no reason.
let bookAbortController = null;

async function refreshBook() {
  bookAbortController?.abort();
  const controller = new AbortController();
  bookAbortController = controller;

  setStatus(state.methods.length ? 'a procurar em profundidade (sem esconder nada)...' : 'a atualizar...');

  try {
    const params = new URLSearchParams({
      platform: state.platform,
      asset: state.asset,
      fiat: state.fiat,
      methods: state.methods.join(','),
    });
    const res = await fetch(`/api/book?${params}`, { signal: controller.signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'erro desconhecido');

    renderList($('#buy-list'), data.buy, 'buy', 'Sem anúncios de venda para este filtro.');
    renderList($('#sell-list'), data.sell, 'sell', 'Sem anúncios de compra para este filtro.');
    renderRedirectHint(data);

    $('#stat-buy').textContent = data.best.buy ? `${fmtPrice(data.best.buy.price)} ${state.fiat}` : '—';
    $('#stat-sell').textContent = data.best.sell ? `${fmtPrice(data.best.sell.price)} ${state.fiat}` : '—';

    const spreadEl = $('#stat-spread');
    if (data.best.spreadPct != null) {
      const positive = data.best.spreadPct >= 0;
      spreadEl.textContent = `${positive ? '+' : ''}${data.best.spreadPct.toFixed(2)}%`;
      spreadEl.className = `stat-value ${positive ? 'positive' : 'negative'}`;
      checkAndFireAlert(data.best.spreadPct);
    } else {
      spreadEl.textContent = '—';
      spreadEl.className = 'stat-value';
    }

    lastBook = { buy: data.buy, sell: data.sell };
    computeAndRenderGain();

    const depthNote = data.searchDepth ? ` · até ${data.searchDepth} anúncios/lado` : '';
    setStatus(`atualizado ${timeAgo(data.generatedAt)}${depthNote}`);
    renderTransparencyNote(data.transparency);
  } catch (err) {
    if (err.name === 'AbortError') return; // superseded by a newer request - nothing to report
    setStatus(`falhou: ${err.message}`, true);
  }
}

/** When a method filter leaves a side empty, point at the fiat(s) where those methods actually work. */
function renderRedirectHint(data) {
  const el = $('#redirect-hint');
  if (!state.methods.length || (data.buy.length && data.sell.length)) {
    el.innerHTML = '';
    return;
  }

  const suggestions = state.methods
    .map((name) => currentMethods.find((m) => m.name === name))
    .filter(Boolean)
    .flatMap((entry) => entry.fiats.map((f) => ({ method: entry.name, ...f })))
    .filter((s) => s.fiat !== state.fiat)
    .sort((a, b) => b.count - a.count);

  if (!suggestions.length) {
    el.innerHTML = `<div class="redirect-hint">Nenhum dos métodos escolhidos tem anúncios ativos em nenhum mercado desta plataforma neste momento.</div>`;
    return;
  }

  const top = suggestions.slice(0, 4);
  el.innerHTML = `
    <div class="redirect-hint">
      <span>Sem anúncios suficientes em ${state.fiat}. Estes métodos existem noutras moedas:</span>
      ${top
        .map((s) => `<button type="button" data-method="${s.method}" data-fiat="${s.fiat}">${s.method} · ${s.fiat} (${s.count})</button>`)
        .join('')}
    </div>`;

  el.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => activateMethodInFiat(btn.dataset.method, btn.dataset.fiat));
  });
}

// ---------------------------------------------------------------------------
// Quick platform comparison strip - a side-by-side glance at the same
// asset+fiat on all 3 platforms, unfiltered, so switching only happens when
// it's actually worth it.
// ---------------------------------------------------------------------------

async function refreshCompare() {
  const el = $('#compare-strip');
  try {
    const res = await fetch(`/api/compare?asset=${state.asset}&fiat=${state.fiat}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'erro');
    renderCompareStrip(data.platforms);
  } catch (err) {
    el.innerHTML = `<span class="muted">Não foi possível comparar: ${err.message}</span>`;
  }
}

function renderCompareStrip(list) {
  const el = $('#compare-strip');
  el.innerHTML = list
    .map((p) => {
      if (p.error || p.bestBuy == null || p.bestSell == null) {
        return `
          <div class="compare-card ${p.platform === state.platform ? 'current' : ''}" data-platform="${p.platform}">
            <span class="compare-name">${p.label}</span>
            <span class="muted">sem dados agora</span>
          </div>`;
      }
      const positive = p.spreadPct >= 0;
      return `
        <div class="compare-card ${p.platform === state.platform ? 'current' : ''}" data-platform="${p.platform}">
          <span class="compare-name">${p.label}</span>
          <div class="compare-prices">
            <span class="price-buy">${fmtPrice(p.bestBuy)}</span>
            <span class="price-sell">${fmtPrice(p.bestSell)}</span>
          </div>
          <span class="compare-spread" style="color: var(${positive ? '--buy' : '--sell'})">${positive ? '+' : ''}${p.spreadPct.toFixed(2)}% spread</span>
        </div>`;
    })
    .join('');

  el.querySelectorAll('.compare-card').forEach((card) => {
    card.addEventListener('click', () => {
      const platform = card.dataset.platform;
      if (platform === state.platform) return;
      const btn = document.querySelector(`#platform-picker [data-platform="${platform}"]`);
      btn?.click();
    });
  });
}

// ---------------------------------------------------------------------------
// "Melhor cripto para os teus métodos favoritos" - scans a shortlist of major
// assets on the current platform+fiat, filtered to your favorite payment
// methods, and ranks them by spread. Reuses the existing /api/book endpoint
// once per asset (no new backend route needed) and renders each row the
// moment ITS OWN fetch resolves - deliberately progressive, so there's always
// something visibly happening instead of one long silent wait.
// ---------------------------------------------------------------------------

const BEST_ASSET_CANDIDATES = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB'];

function renderBestAssetHint() {
  const hint = $('#best-asset-hint');
  const btn = $('#best-asset-scan-btn');
  if (!state.favoriteMethods.length) {
    hint.textContent = 'Marca métodos com ★ na lista abaixo para ativar isto.';
    btn.disabled = true;
  } else {
    hint.textContent = `Usa os teus favoritos: ${state.favoriteMethods.join(', ')}`;
    btn.disabled = false;
  }
}

async function scanBestAsset() {
  if (!state.favoriteMethods.length) return;
  const container = $('#best-asset-list');
  const methodsParam = state.favoriteMethods.join(',');

  container.innerHTML = BEST_ASSET_CANDIDATES.map(
    (asset) => `
      <div class="scan-row" data-asset="${asset}">
        <span class="scan-asset">${asset}</span>
        <span class="scan-status">a verificar...</span>
      </div>`
  ).join('');

  const results = await Promise.all(
    BEST_ASSET_CANDIDATES.map(async (asset) => {
      const row = container.querySelector(`[data-asset="${asset}"]`);
      try {
        const params = new URLSearchParams({ platform: state.platform, asset, fiat: state.fiat, methods: methodsParam });
        const res = await fetch(`/api/book?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'erro');

        if (data.best.spreadPct == null) {
          row.querySelector('.scan-status').textContent = 'sem anúncios com estes métodos agora';
          return { asset, spreadPct: -Infinity };
        }

        const positive = data.best.spreadPct >= 0;
        row.querySelector('.scan-status').outerHTML = `<span class="scan-spread" style="color: var(${positive ? '--buy' : '--sell'})">${positive ? '+' : ''}${data.best.spreadPct.toFixed(2)}%</span>`;
        return { asset, spreadPct: data.best.spreadPct, best: data.best };
      } catch (err) {
        row.querySelector('.scan-status').textContent = `falhou: ${err.message}`;
        return { asset, spreadPct: -Infinity };
      }
    })
  );

  // Re-order rows best-first now that every asset has answered, and mark the winner.
  results.sort((a, b) => b.spreadPct - a.spreadPct);
  container.innerHTML = '';
  results.forEach((r) => {
    const isWinner = r.spreadPct > -Infinity && r === results[0];
    const row = document.createElement('div');
    row.className = `scan-row ${isWinner ? 'winner clickable' : r.best ? 'clickable' : ''}`;
    row.dataset.asset = r.asset;
    const statusHtml =
      r.best != null
        ? `<span class="scan-spread" style="color: var(${r.spreadPct >= 0 ? '--buy' : '--sell'})">${r.spreadPct >= 0 ? '+' : ''}${r.spreadPct.toFixed(2)}%</span>`
        : `<span class="scan-status">sem dados com estes métodos</span>`;
    row.innerHTML = `<span class="scan-asset">${r.asset}${isWinner ? ' 🏆' : ''}</span>${statusHtml}`;
    if (r.best) {
      row.addEventListener('click', () => {
        state.asset = r.asset;
        $('#asset-input').value = r.asset;
        saveSelection();
        renderAmountMode();
        refreshMethods();
        refreshBook();
        refreshCompare();
      });
    }
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Theme (dark default, light optional) - independent of the market
// selection, so it lives in its own small storage key.
// ---------------------------------------------------------------------------

function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('#theme-toggle').textContent = theme === 'light' ? '☀' : '☾';
}

function setupTheme() {
  const theme = loadTheme();
  applyTheme(theme);
  $('#theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}

// ---------------------------------------------------------------------------
// Alerts - a browser notification when the current spread crosses the
// threshold. Best-effort while backgrounded (browsers throttle hidden-tab
// timers on their own); a cooldown stops the same opportunity from spamming
// a notification every refresh cycle.
// ---------------------------------------------------------------------------

const ALERT_COOLDOWN_MS = 3 * 60 * 1000;
let lastAlertAt = 0;

function renderAlertsUI() {
  const btn = $('#alerts-toggle');
  btn.classList.toggle('active', state.alertsEnabled);
  btn.textContent = state.alertsEnabled ? '🔔 Alertas ativos' : '🔔 Ativar alertas';
  $('#alerts-threshold').value = state.alertsThreshold;
}

async function toggleAlerts() {
  if (state.alertsEnabled) {
    state.alertsEnabled = false;
    saveSelection();
    renderAlertsUI();
    $('#alerts-status').textContent = '';
    return;
  }

  if (!('Notification' in window)) {
    $('#alerts-status').textContent = 'O teu browser não suporta notificações.';
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    $('#alerts-status').textContent = 'Permissão de notificações recusada.';
    return;
  }

  state.alertsEnabled = true;
  saveSelection();
  renderAlertsUI();
  $('#alerts-status').textContent = 'A vigiar...';
  scheduleAutoRefresh(); // keep polling even if the tab is currently hidden
}

function checkAndFireAlert(spreadPct) {
  if (!state.alertsEnabled || spreadPct == null) return;
  if (spreadPct < state.alertsThreshold) return;
  if (Date.now() - lastAlertAt < ALERT_COOLDOWN_MS) return;

  lastAlertAt = Date.now();
  $('#alerts-status').textContent = `último aviso: ${new Date().toLocaleTimeString('pt-PT')}`;

  if (Notification.permission === 'granted') {
    new Notification('P2P Watch - oportunidade', {
      body: `${state.asset}/${state.fiat} em ${state.platform}: spread de ${spreadPct.toFixed(2)}%`,
    });
  }
}

// ---------------------------------------------------------------------------
// Estimated gain - either for the exact ad pair the user pinned by clicking
// two rows, or automatically for the best ad that fits the amount to invest.
// Pure client-side math over the already-fetched book, so it feels instant.
// ---------------------------------------------------------------------------

/** Picks the first ad (already price-sorted) whose min/max FIAT limits fit `amount`; falls back to the top ad. */
function pickForAmount(ads, amount) {
  if (!ads.length) return null;
  return ads.find((ad) => amount >= ad.minAmount && amount <= ad.maxAmount) || ads[0];
}

/** Picks the first sell ad that can actually absorb `qty` units of crypto (enough liquidity, resulting fiat value within its limits); falls back to the top ad. */
function pickForCryptoQty(ads, qty) {
  if (!ads.length) return null;
  return (
    ads.find((ad) => {
      const fiatValue = qty * ad.price;
      const fitsLimits = fiatValue >= ad.minAmount && fiatValue <= ad.maxAmount;
      const fitsLiquidity = !ad.tradableQuantity || ad.tradableQuantity >= qty;
      return fitsLimits && fitsLiquidity;
    }) || ads[0]
  );
}

function resetGain(message) {
  $('#stat-gain').textContent = '—';
  $('#stat-gain').className = 'stat-value';
  $('#gain-note').textContent = message || '';
  resetHero(message);
}

function resetHero(message) {
  $('#hero-card').className = 'hero-card';
  $('#hero-kicker').textContent = 'Sem recomendação agora';
  $('#hero-headline').textContent = message || 'Indica um valor e escolhe um mercado com anúncios ativos.';
  $('#hero-number').textContent = '—';
  $('#hero-number-label').textContent = '';
  $('#hero-total-row').innerHTML = '';
  $('#hero-legs').innerHTML = '';
  $('#hero-detail').textContent = '';
}

/** One computed result feeds both the compact stat tile and the big hero card - single source of truth. */
function computeAndRenderGain() {
  const gainLabel = $('#gain-label');
  const gainEl = $('#stat-gain');
  const noteEl = $('#gain-note');
  const amount = Number(state.amount);

  if (!lastBook || !amount || amount <= 0) {
    resetGain('Indica quanto tens (dinheiro ou cripto) para veres a recomendação.');
    return;
  }

  const feePct = Number(state.feePct) || 0;
  const feeNote = feePct > 0 ? ` · já descontada taxa de ${feePct}%` : '';

  if (state.amountMode === 'crypto') {
    // "Já tenho X cripto, quanto recebo se vender agora" - no buy leg at all,
    // just find the best real sell ad that can actually take this quantity.
    gainLabel.textContent = 'Vais receber';
    const qty = amount;
    const sellPick = selection.sell || pickForCryptoQty(lastBook.sell, qty);
    if (!sellPick) {
      resetGain('Sem anúncios de venda disponíveis.');
      return;
    }

    const grossProceeds = qty * sellPick.price;
    const netProceeds = grossProceeds * (1 - feePct / 100);
    gainEl.textContent = `${fmtMoney(netProceeds)} ${state.fiat}`;
    gainEl.className = 'stat-value';

    const fits = grossProceeds >= sellPick.minAmount && grossProceeds <= sellPick.maxAmount && (!sellPick.tradableQuantity || sellPick.tradableQuantity >= qty);
    const fitWarning = fits ? '' : ' · pode não caber num só anúncio (limites/liquidez) - considera dividir a venda';
    const pinnedNote = selection.sell ? ' · seleção manual (clica de novo na linha para soltar)' : '';
    noteEl.textContent = `vende ${qty} ${state.asset} a ${fmtPrice(sellPick.price)} via ${sellPick.methods.join(', ')} · ${sellPick.advertiser ?? '-'}${feeNote}${fitWarning}${pinnedNote}`;

    $('#hero-card').className = 'hero-card positive';
    $('#hero-kicker').textContent = `Tens ${qty} ${state.asset} · vende assim`;
    $('#hero-headline').innerHTML = `Vende em <b>${sellPick.methods[0]}</b> (${sellPick.advertiser ?? '-'}) por <b>${fmtPrice(sellPick.price)} ${state.fiat}</b> cada ${state.asset}`;
    $('#hero-number').textContent = `${fmtMoney(netProceeds)} ${state.fiat}`;
    $('#hero-number-label').textContent = 'vais receber' + (feePct > 0 ? ' (líquido)' : '');
    $('#hero-total-row').innerHTML =
      feePct > 0 ? `Valor bruto do negócio: <b>${fmtMoney(grossProceeds)} ${state.fiat}</b> · depois da taxa de ${feePct}%: <b>${fmtMoney(netProceeds)} ${state.fiat}</b>` : '';
    $('#hero-legs').innerHTML = `
      <div class="hero-leg sell">
        <div class="hero-leg-label">Vender</div>
        <div class="hero-leg-price">${fmtPrice(sellPick.price)} ${state.fiat}</div>
        <div class="hero-leg-meta">${sellPick.methods.join(', ')} · ${sellPick.advertiser ?? '-'}</div>
        <div class="hero-leg-total">= ${fmtMoney(grossProceeds)} ${state.fiat} no total</div>
      </div>`;
    $('#hero-detail').textContent = `${fitWarning ? fitWarning.replace(' · ', '') + ' · ' : ''}limites do anúncio: ${fmtAmount(sellPick.minAmount)}–${fmtAmount(sellPick.maxAmount)} ${state.fiat}${pinnedNote}`;
    return;
  }

  // "Tenho X em dinheiro, compro e depois vendo" - the original round-trip calc.
  gainLabel.textContent = 'Ganho estimado';
  const pinned = selection.buy || selection.sell;
  const buyPick = selection.buy || pickForAmount(lastBook.buy, amount);
  if (!buyPick) {
    resetGain('Sem anúncios de compra disponíveis.');
    return;
  }

  const qty = Math.min(amount / buyPick.price, buyPick.tradableQuantity || Infinity);
  const roughProceeds = qty * (lastBook.sell[0]?.price || 0);
  const sellPick = selection.sell || pickForAmount(lastBook.sell, roughProceeds);
  if (!sellPick) {
    resetGain('Sem anúncios de venda disponíveis.');
    return;
  }

  const grossProceeds = qty * sellPick.price;
  const netProceeds = grossProceeds * (1 - feePct / 100);
  const gain = netProceeds - amount;
  const positive = gain >= 0;

  gainEl.textContent = `${positive ? '+' : ''}${fmtMoney(gain)} ${state.fiat}`;
  gainEl.className = `stat-value ${positive ? 'positive' : 'negative'}`;

  const buyFits = amount >= buyPick.minAmount && amount <= buyPick.maxAmount;
  const fitWarning = buyFits ? '' : ' · fora dos limites deste anúncio';
  const pinnedNote = pinned ? ' · seleção manual (clica de novo na linha para soltar)' : '';
  noteEl.textContent = `compra a ${fmtPrice(buyPick.price)}, vende a ${fmtPrice(sellPick.price)} (~${qty.toFixed(2)} ${state.asset})${feeNote}${fitWarning}${pinnedNote}`;

  $('#hero-card').className = `hero-card ${positive ? 'positive' : 'negative'}`;
  $('#hero-kicker').textContent = `Tens ${fmtMoney(amount)} ${state.fiat} · plano de compra e venda`;
  $('#hero-headline').innerHTML = `Compra em <b>${buyPick.methods[0]}</b> (${buyPick.advertiser ?? '-'}) → vende em <b>${sellPick.methods[0]}</b> (${sellPick.advertiser ?? '-'})`;
  $('#hero-number').textContent = `${positive ? '+' : ''}${fmtMoney(gain)} ${state.fiat}`;
  $('#hero-number-label').textContent = `${positive ? 'lucro' : 'prejuízo'} estimado (${((gain / amount) * 100).toFixed(2)}%)`;
  $('#hero-total-row').innerHTML = `Ficas com <b>${fmtMoney(netProceeds)} ${state.fiat}</b> no total${feePct > 0 ? ` (bruto: ${fmtMoney(grossProceeds)} ${state.fiat})` : ''}`;
  $('#hero-legs').innerHTML = `
    <div class="hero-leg buy">
      <div class="hero-leg-label">Comprar</div>
      <div class="hero-leg-price">${fmtPrice(buyPick.price)} ${state.fiat}</div>
      <div class="hero-leg-meta">${buyPick.methods.join(', ')} · ${buyPick.advertiser ?? '-'}</div>
      <div class="hero-leg-total">= ${qty.toFixed(2)} ${state.asset} no total</div>
    </div>
    <div class="hero-leg sell">
      <div class="hero-leg-label">Vender</div>
      <div class="hero-leg-price">${fmtPrice(sellPick.price)} ${state.fiat}</div>
      <div class="hero-leg-meta">${sellPick.methods.join(', ')} · ${sellPick.advertiser ?? '-'}</div>
      <div class="hero-leg-total">= ${fmtMoney(grossProceeds)} ${state.fiat} no total</div>
    </div>`;
  $('#hero-detail').textContent = `~${qty.toFixed(2)} ${state.asset} negociados${feeNote}${fitWarning}${pinnedNote}`;
}

function setStatus(text, isError = false) {
  const el = $('#refresh-status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

/** Spells out exactly what got excluded and why - nothing should ever just silently vanish. */
function renderTransparencyNote(t) {
  const el = $('#transparency-note');
  if (!t) {
    el.textContent = '';
    return;
  }
  const parts = [`${t.scanned} anúncios analisados`];
  if (t.excludedByMethod) parts.push(`${t.excludedByMethod} sem o método escolhido`);
  if (t.excludedByReputation) parts.push(`${t.excludedByReputation} excluídos por reputação baixa do anunciante`);
  if (t.matchingNotShown) parts.push(`+${t.matchingNotShown} outros correspondentes não mostrados (só os 15 melhores de cada lado)`);
  el.textContent = parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function scheduleAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    refreshBook();
    refreshCompare();
  }, state.refreshMs);
}

function stopAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

// A backgrounded tab gains nothing from polling every 15s - pause while
// hidden and catch up the instant it's visible again, instead of quietly
// spending rateGate slots on a screen nobody is looking at. Exception: with
// alerts on, the whole point is to keep checking while you're not staring at
// the tab, so keep polling (best-effort - browsers throttle background
// timers regardless, this just avoids us adding our own pause on top).
function setupVisibilityPause() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!state.alertsEnabled) stopAutoRefresh();
    } else {
      refreshBook();
      refreshCompare();
      scheduleAutoRefresh();
    }
  });
}

function onAssetChange() {
  const asset = $('#asset-input').value.trim().toUpperCase() || 'USDT';
  if (asset === state.asset) return;
  state.asset = asset;
  state.methods = []; // the whole catalog is asset-scoped
  clearSelection();
  saveSelection();
  renderAmountMode();
  refreshMethods();
  refreshBook();
  refreshCompare();
  updateClearButtonVisibility();
}

function onFiatChange() {
  const fiat = $('#fiat-input').value.trim().toUpperCase() || 'MZN';
  if (fiat === state.fiat) return;
  state.fiat = fiat;
  clearSelection();
  saveSelection();
  renderAmountMode();
  renderMethods(); // just re-highlights which fiat-tag is "current", catalog itself is unchanged
  refreshBook();
  refreshCompare();
  updateClearButtonVisibility();
}

document.addEventListener('DOMContentLoaded', async () => {
  setupTheme();
  await loadStaticData();
  refreshMethods();
  refreshBook();
  refreshCompare();
  scheduleAutoRefresh();
  setupVisibilityPause();
  updateClearButtonVisibility();
  renderAlertsUI();

  $('#fiat-input').addEventListener('change', onFiatChange);
  $('#asset-input').addEventListener('change', onAssetChange);

  $('#method-search').addEventListener('input', (e) => {
    methodSearchTerm = e.target.value;
    renderMethods();
    updateClearButtonVisibility();
  });

  $('#fiat-only-toggle').addEventListener('click', () => {
    fiatOnlyMethods = !fiatOnlyMethods;
    renderMethods();
  });

  $('#clear-selection-btn').addEventListener('click', clearAllSelections);

  $('#amount-input').addEventListener('input', () => {
    state.amount = Number($('#amount-input').value) || 0;
    saveSelection();
    computeAndRenderGain();
  });

  $('#fee-input').value = state.feePct;
  $('#fee-input').addEventListener('input', () => {
    state.feePct = Math.max(0, Number($('#fee-input').value) || 0);
    saveSelection();
    computeAndRenderGain();
  });

  document.querySelectorAll('#amount-mode-toggle .mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === state.amountMode) return;
      state.amountMode = btn.dataset.mode;
      saveSelection();
      renderAmountMode();
      computeAndRenderGain();
    });
  });

  $('#refresh-interval').value = state.refreshMs;
  $('#refresh-interval').addEventListener('change', (e) => {
    state.refreshMs = Number(e.target.value);
    saveSelection();
    scheduleAutoRefresh();
  });

  $('#alerts-toggle').addEventListener('click', toggleAlerts);
  $('#alerts-threshold').addEventListener('input', (e) => {
    state.alertsThreshold = Math.max(0, Number(e.target.value) || 0);
    saveSelection();
  });

  renderBestAssetHint();
  $('#best-asset-scan-btn').addEventListener('click', scanBestAsset);
});
