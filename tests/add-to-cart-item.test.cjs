const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const bundle = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = bundle.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>/);
assert.ok(match, 'index.html contains the bundled storefront template');
const html = JSON.parse(match[1]);

test('product card buttons bind per-item add, never the DOM-scraping handler', () => {
  // Regression: {{ addToCart }} resolved handleAdd, which scraped the nearest
  // h3/p from the DOM and always picked up the "Request bentuk apa saja" banner.
  const card = html.slice(html.indexOf('<sc-for list="{{ sheetItems }}"'), html.indexOf('{{ sheetNote }}'));
  const buyBtns = [...card.matchAll(/<sc-if value="\{\{ it\.showBuy(?:Ready|Po) \}\}"[\s\S]{0,200}?sc-camel-on-click="\{\{ ([^}]+) \}\}"[^>]*class="cbtn"/g)];
  assert.ok(buyBtns.length >= 2, 'expected buy buttons in card, got ' + buyBtns.length);
  for (const b of buyBtns) assert.equal(b[1], 'it.add', 'buy button binds ' + b[1]);
  const fabs = [...card.matchAll(/sc-camel-on-click="\{\{ ([^}]+) \}\}"[^>]*aria-label="Tambah ke keranjang"/g)];
  assert.ok(fabs.length >= 1, 'expected cart fab in card');
  for (const b of fabs) assert.equal(b[1], 'it.add', 'cart fab binds ' + b[1]);
  assert.ok(!card.includes('{{ addToCart }}'), 'no legacy DOM-scraping handler left in product card');
});

test('addItem puts the clicked product (name, price, photo) into the cart', () => {
  const start = html.indexOf('  addItem(it, jml) {');
  const end = html.indexOf('/**', start);
  assert.ok(start !== -1 && end !== -1, 'addItem source found');
  const methods = html.slice(start, end);
  const events = [];
  const H = new Function('window', 'navigator', 'fetch', 'setTimeout', 'history', 'location',
    `return class {${methods}}`)( { dataLayer: [] }, {}, () => Promise.resolve({}), () => 0, { replaceState() {} }, { pathname: '/' });
  const h = new H();
  Object.assign(h, {
    LIBUR: false,
    state: { cart: [], cartOpen: false, cartStep: 1 },
    trackFunnel(e) { events.push(e); },
    setState(u) { Object.assign(this.state, typeof u === 'function' ? u(this.state) : u); },
  });
  const item = {
    name: 'Boneka Koya', kategori: 'K-Pop', desc: 'd', stock: 'Ready',
    qty: 5, payLink: '', isCustom: false, priceLabel: 'Rp120.000', priceRaw: 120000,
    images: [{ url: 'https://img.invalid/koya.jpg', alts: '', alt: 'Boneka Koya foto 1' }],
  };
  h.addItem(item); h.addItem({ ...item, name: 'Boneka Lain', priceRaw: 75000, priceLabel: 'Rp75.000', images: [{ url: 'https://img.invalid/lain.jpg', alts: '', alt: 'x' }] });
  assert.equal(h.state.cart.length, 2);
  assert.equal(h.state.cart[0].name, 'Boneka Koya');
  assert.equal(h.state.cart[0].price, 120000);
  assert.equal(h.state.cart[0].priceLabel, 'Rp120.000');
  assert.equal(h.state.cart[0].photo, 'https://img.invalid/koya.jpg');
  assert.equal(h.state.cart[1].name, 'Boneka Lain');
  assert.equal(h.state.cart[1].price, 75000);
  assert.equal(h.state.cartOpen, true);
});
