const binanceClient = require('./binanceClient');
const bybitClient = require('./bybitClient');
const okxClient = require('./okxClient');

// Registry of supported P2P platforms. Adding another platform means adding
// a client module with a fetchBook({asset, fiat, rows}) function returning
// {buy, sell} arrays in the normalized ad shape, then one entry here.
const REGISTRY = {
  binance: { id: 'binance', label: 'Binance', fetchBook: binanceClient.fetchBook },
  bybit: { id: 'bybit', label: 'Bybit', fetchBook: bybitClient.fetchBook },
  okx: { id: 'okx', label: 'OKX', fetchBook: okxClient.fetchBook },
};

function listPlatforms() {
  return Object.values(REGISTRY).map(({ id, label }) => ({ id, label }));
}

function getPlatform(id) {
  return REGISTRY[id] || null;
}

module.exports = { listPlatforms, getPlatform };
