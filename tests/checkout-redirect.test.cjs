'use strict';
// Checkout UX: Bayar Sekarang memberi feedback visual (spinner + teks redirect
// Mayar) dan redirect memakai assign + fallback tab baru bila 1.5 dtk macet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const decoded = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .match(/<script type="__bundler\/template">([\s\S]*?)<\/script>\s*<\/body>/)[1]
);

test('pay button swaps card icon for spinner while paying', () => {
  assert.ok(decoded.includes('{{ payBusy }}'), 'payBusy binding must exist');
  assert.ok(decoded.includes('{{ payIdle }}'), 'payIdle binding must exist');
  assert.ok(decoded.includes('payBusy: this.state.paying'), 'payBusy must follow state.paying');
  assert.ok(decoded.includes('animation:preRing'), 'busy icon must reuse preRing spinner');
});

test('paying shows Mayar redirect note', () => {
  assert.match(decoded, /Mengarahkan ke halaman pembayaran Mayar/, 'redirect note must mention Mayar');
});

test('invoice success redirects hard (assign + new-tab fallback)', () => {
  const method = decoded.slice(decoded.indexOf('  handlePay ='), decoded.indexOf('  payFallback('));
  assert.ok(method.includes('window.location.assign(link)'), 'must use location.assign first');
  assert.ok(method.includes('window.open(link, "_blank")'), 'must fall back to new tab');
  assert.ok(method.includes('setState({ paying: false'), 'must clear paying before redirect');
});
