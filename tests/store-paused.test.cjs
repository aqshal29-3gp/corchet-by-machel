'use strict';
// Toko Libur (store-paused / etalase) mode: order-initiation paths must
// hard-block, order buttons must be visibly disabled + relabelled, and a
// visible red banner must render. No network, no orders while paused.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const template = fs
  .readFileSync(path.join(__dirname, '../index.html'), 'utf8')
  .match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1];
const decoded = JSON.parse(template);

const MSG = 'Mohon maaf, toko sedang dalam perbaikan (maintenance) sistem. Checkout untuk sementara ditutup.';

// Slice a class method body from the decoded template by its start marker.
// Capture a generous window; guard must appear near the top regardless.
function methodBody(marker) {
  const s = decoded.indexOf(marker);
  assert.ok(s >= 0, 'missing method: ' + marker);
  return decoded.slice(s, s + 600);
}

test('LIBUR flag exists as a single source of truth', () => {
  // class field declaration: `LIBUR = false;` while the store is OPEN
  // (referenced as this.LIBUR elsewhere). Flip to `true` to pause again.
  assert.match(decoded, /\bLIBUR\s*=\s*false\s*;/, 'expected a LIBUR = false class field (store open)');
  assert.ok(decoded.includes(MSG), 'LIBUR_MSG must still carry the operator-approved pause copy for reuse');
});

test('order-initiation methods hard-block when LIBUR is true', () => {
  for (const marker of [
    'handleAdd = (e) => {',
    'addConfigured = () => {',
    'handleCheckout = (existingOrderId) => {',
    'handlePay = () => {',
  ]) {
    const body = methodBody(marker);
    assert.match(
      body,
      /if\s*\(\s*this\.LIBUR\s*\)/,
      'guard `if (this.LIBUR)` must be present near the top of ' + marker,
    );
  }
});

test('addItem (card + detail-modal add path) also blocks when LIBUR is true', () => {
  const body = methodBody('addItem(it, jml) {');
  assert.match(body, /if\s*\(\s*this\.LIBUR\s*\)/, 'addItem must guard on this.LIBUR');
});

test('toStep2 (cart step 1 -> 2) also blocks when LIBUR is true', () => {
  const s = decoded.indexOf('toStep2: () => {');
  assert.ok(s >= 0, 'missing toStep2 render prop');
  const body = decoded.slice(s, s + 400);
  assert.match(body, /if\s*\(\s*this\.LIBUR\s*\)/, 'toStep2 must guard on this.LIBUR');
});

test('a visible store-paused banner is rendered with the required copy', () => {
  assert.ok(
    decoded.includes('toko sedang dalam perbaikan (maintenance) sistem'),
    'banner copy "toko sedang dalam perbaikan (maintenance) sistem" must be present',
  );
  assert.ok(
    decoded.includes('Checkout untuk sementara ditutup'),
    'banner must state checkout is temporarily closed',
  );
  // banner must carry a data hook so QA can locate it
  assert.match(decoded, /data-libur-banner/, 'banner must expose data-libur-banner');
});

test('banner is static (does not cover the sticky header nav on scroll)', () => {
  const s = decoded.indexOf('data-libur-banner');
  assert.ok(s >= 0, 'banner missing');
  const el = decoded.slice(Math.max(0, s - 400), s + 200);
  assert.ok(!/position:\s*sticky/.test(el), 'banner must not be position:sticky');
  assert.ok(!/position:\s*fixed/.test(el), 'banner must not be position:fixed');
});

test('every order button is disabled while LIBUR is true', () => {
  // card quick-add FAB + ready/PO buy buttons ({{ it.add }} -> addItem)
  assert.match(
    decoded,
    /sc-camel-on-click="\{\{ it\.add \}\}"[^>]*disabled="\{\{ liburDis \}\}"/,
    'card cfab/buy buttons must bind disabled="{{ liburDis }}"',
  );
  // custom-modal add, cart step, checkout, detail-modal add
  for (const h of ['addConfigured', 'toStep2', 'checkout', 'detailTambah']) {
    assert.match(
      decoded,
      new RegExp('sc-camel-on-click="\\{\\{ ' + h + ' \\}\\}"[^>]*disabled="\\{\\{ liburDis \\}\\}"'),
      h + ' button must bind disabled="{{ liburDis }}"',
    );
  }
  // pay button already had a disabled binding: it must now follow liburPayDis
  assert.match(
    decoded,
    /sc-camel-on-click="\{\{ payNow \}\}"[^>]*disabled="\{\{ liburPayDis \}\}"/,
    'pay button must bind disabled="{{ liburPayDis }}"',
  );
  // render props backing the bindings
  assert.match(decoded, /liburDis:\s*this\.LIBUR/, 'render must expose liburDis');
  assert.match(
    decoded,
    /liburPayDis:\s*this\.state\.paying\s*\|\|\s*this\.LIBUR/,
    'render must expose liburPayDis (paying OR libur)',
  );
});

test('order buttons relabel while LIBUR is true (no dead clicks)', () => {
  for (const prop of [
    'liburBeliReady',
    'liburBeliPo',
    'liburTambah',
    'liburLanjut',
    'liburCheckout',
  ]) {
    assert.match(
      decoded,
      new RegExp(prop + ':\\s*this\\.LIBUR\\s*\\?\\s*"Toko Libur'),
      prop + ' must swap to a "Toko Libur…" label when paused',
    );
  }
  assert.match(
    decoded,
    /payLabel:\s*this\.LIBUR\s*\?\s*"Toko Libur[^"]*Checkout Ditutup"/,
    'payLabel must swap when paused',
  );
  assert.match(
    decoded,
    /detailBeliLabel:\s*this\.LIBUR\s*\?\s*"Toko Libur"/,
    'detailBeliLabel must swap when paused',
  );
  assert.match(
    decoded,
    /detailBeliBg:\s*this\.LIBUR\s*\?\s*"#B7C3AA"/,
    'detail buy button must turn grey when paused',
  );
  // EN dictionary covers the new labels so the EN toggle keeps working
  assert.match(decoded, /"Toko Libur":\s*"Store paused"/, 'KAMUS must translate "Toko Libur"');
});

test('cart hint surfaces the pause copy when LIBUR is true', () => {
  assert.match(
    decoded,
    /checkoutHint:\s*this\.state\.hint\s*\|\|\s*\(this\.LIBUR\s*\?\s*this\.LIBUR_MSG/,
    'checkoutHint must default to LIBUR_MSG while paused',
  );
});

test('the guard sits before any cart mutation / network in each order path', () => {
  // In every guarded method the LIBUR check must appear before the first
  // side-effecting call so a paused store can never mutate cart or hit network.
  const checks = [
    { marker: 'handleAdd = (e) => {', after: 'catatStat' },
    { marker: 'handleCheckout = (existingOrderId) => {', after: 'catatStat' },
    { marker: 'handlePay = () => {', after: 'cekBiodata' },
  ];
  for (const { marker, after } of checks) {
    const body = decoded.slice(decoded.indexOf(marker), decoded.indexOf(marker) + 700);
    const g = body.indexOf('this.LIBUR');
    const sideEffect = body.indexOf(after);
    assert.ok(g >= 0, 'LIBUR guard missing in ' + marker);
    assert.ok(sideEffect >= 0, 'anchor ' + after + ' not found in ' + marker);
    assert.ok(g < sideEffect, 'LIBUR guard must precede ' + after + ' in ' + marker);
  }
});
