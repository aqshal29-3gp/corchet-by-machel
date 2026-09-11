const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index-rebuild.html'), 'utf8');

test('product card follows compact menu-card layout without changing cart hooks', () => {
  assert.match(html, /\.product-card\{[^}]*background:var\(--paper\)[^}]*border:1px solid var\(--line\)[^}]*border-radius:1\.25rem/);
  assert.match(html, /\.product-card-img\{[^}]*aspect-ratio:4\/3[^}]*border-radius:/);
  assert.match(html, /class="product-card-meta"/);
  assert.match(html, /class="[^"]*product-card-add[^"]*"[^>]*data-add-index="\$\{i\}"[^>]*aria-label="Tambah \$\{esc\(p\.nama\)\} ke keranjang"/);
  assert.match(html, /data-detail-index="\$\{i\}"/);
});
