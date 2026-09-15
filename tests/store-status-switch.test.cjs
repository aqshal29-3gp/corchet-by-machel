'use strict';
// Saklar Buka/Libur via Spreadsheet: frontend reads status-toko.json (sync
// from tab Pengaturan), backend guards order/invoice + exposes action=statusToko.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const decoded = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]
);
const gs = fs.readFileSync(path.join(ROOT, 'AppsScript-GaleriCustom.gs'), 'utf8');

test('frontend fetches status-toko.json with fail-open default', () => {
  assert.ok(decoded.includes('fetch("status-toko.json"'), 'must fetch status-toko.json');
  assert.ok(decoded.includes('loadStatusToko'), 'loader must exist');
  assert.ok(decoded.includes('this.loadStatusToko();'), 'must be called on mount');
  // fail-open: no libur flag in file/response => LIBUR stays false
  assert.match(decoded, /\bLIBUR\s*=\s*false\s*;/, 'LIBUR default must stay false (fail-open)');
});

test('status-toko.json exists, valid, libur=false default', () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'status-toko.json'), 'utf8'));
  assert.equal(j.libur, false);
  assert.ok(typeof j.pesan === 'string' && j.pesan.length > 10, 'pesan fallback present');
});

test('Apps Script: TOKO_LIBUR const + statusToko endpoint + order/invoice guards', () => {
  assert.ok(gs.includes("PB('TOKO_LIBUR'"), 'TOKO_LIBUR const must read tab Pengaturan');
  assert.ok(gs.includes("P('TOKO_LIBUR_PESAN'"), 'TOKO_LIBUR_PESAN const must exist');
  assert.ok(gs.includes("p.action === 'statusToko'"), 'public statusToko endpoint must exist');
  assert.match(gs, /data\.type === 'order'\) \{\s*\n\s*if \(TOKO_LIBUR\)/, 'order branch must hard-block when libur');
  assert.match(gs, /data\.type === 'invoice'\) \{\s*\n\s*if \(TOKO_LIBUR\)/, 'invoice branch must hard-block when libur');
});

test('Apps Script: DAFTAR_SETTING carries the new keys for setup/run', () => {
  assert.ok(gs.includes("['TOKO_LIBUR'"), 'TOKO_LIBUR must be in DAFTAR_SETTING');
  assert.ok(gs.includes("['TOKO_LIBUR_PESAN'"), 'TOKO_LIBUR_PESAN must be in DAFTAR_SETTING');
});
