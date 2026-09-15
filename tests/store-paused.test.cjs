'use strict';
// Toko Libur (store-paused) mode: order-initiation paths must hard-block and a
// visible red banner must render, when the store is paused. No network, no orders.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const template = fs
  .readFileSync(path.join(__dirname, '../index.html'), 'utf8')
  .match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1];
const decoded = JSON.parse(template);

// Slice a class method body from the decoded template by its start marker up to
// the next method start (heuristic: next occurrence of "\n\n  " at same indent).
function methodBody(marker) {
  const s = decoded.indexOf(marker);
  assert.ok(s >= 0, 'missing method: ' + marker);
  // capture a generous window; guard must appear near the top regardless
  return decoded.slice(s, s + 600);
}

test('LIBUR flag exists as a single source of truth', () => {
  // class field declaration: `LIBUR = true;` (referenced as this.LIBUR elsewhere)
  assert.match(decoded, /\bLIBUR\s*=\s*true\s*;/, 'expected a LIBUR = true class field');
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

test('addItem (detail-modal add path) also blocks when LIBUR is true', () => {
  const body = methodBody('addItem(it, jml) {');
  assert.match(body, /if\s*\(\s*this\.LIBUR\s*\)/, 'addItem must guard on this.LIBUR');
});

test('a visible store-paused banner is rendered with the required copy', () => {
  assert.ok(
    decoded.includes('Toko saat ini sedang libur'),
    'banner copy "Toko saat ini sedang libur" must be present',
  );
  assert.ok(
    decoded.includes('belum dapat menerima pesanan baru'),
    'banner must state new orders cannot be accepted for now',
  );
  // banner must carry a data hook so QA can locate it
  assert.match(decoded, /data-libur-banner/, 'banner must expose data-libur-banner');
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
