const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const bundle = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const match = bundle.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>/);
assert.ok(match, 'index.html contains the bundled storefront template');
const html = JSON.parse(match[1]);

test('live product card uses the approved compact menu-card design', () => {
  assert.match(html, /\.product-card\{[^}]*background:var\(--paper\)[^}]*border:1px solid var\(--line\)[^}]*border-radius:1\.25rem/);
  assert.match(html, /\.product-card-img\{[^}]*aspect-ratio:4\/3[^}]*border-radius:/);
  assert.match(html, /class="product-card-meta"/);
});

test('live product card preserves catalog detail and cart hooks', () => {
  assert.match(html, /<sc-for list="\{\{ sheetItems \}\}" as="it"/);
  assert.match(html, /sc-camel-on-click="\{\{ addToCart \}\}"[^>]*aria-label="Tambah ke keranjang"/);
  assert.match(html, /sc-camel-on-click="\{\{ it\.buka \}\}"[^>]*class="product-card-name"/);
  assert.match(html, /\{\{ it\.stockLabel \}\}/);
  assert.match(html, /\{\{ it\.priceLabel \}\}/);
});
