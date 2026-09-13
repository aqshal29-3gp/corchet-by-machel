'use strict';
// Guard: shipping copy must never promise a flat nationwide rate. Real rates come from
// RajaOngkir via the connector; when that fails we say the quote is unavailable and
// will be confirmed on WhatsApp, and the total must disclose that shipping is excluded.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>\s*<\/body>/);
assert.ok(m, 'bundler template must be present');
const tmpl = JSON.parse(m[1]);

test('no flat-rate shipping claim anywhere', () => {
  assert.ok(!tmpl.includes('Ongkir kami samakan untuk seluruh Indonesia'), 'must not claim one flat rate nationwide');
  assert.ok(!/ongkir\s+flat/i.test(tmpl.replace(/\/\/.*$/gm, '')), 'must not advertise flat shipping to buyers');
});

test('shipping fallback tells the buyer it is confirmed on WhatsApp', () => {
  assert.ok(tmpl.includes('Cek ongkir otomatis sedang tidak tersedia'), 'fallback copy must state quotes are unavailable');
  assert.ok(tmpl.includes('konfirmasi lewat WhatsApp sebelum pembayaran'), 'fallback must promise WhatsApp confirmation before payment');
});

test('connector failure surfaces the fallback instead of a dead end', () => {
  assert.ok(tmpl.includes('busy: false, flat: true, err:'), 'failed quote must flip to the fallback state');
});

test('total discloses that shipping is not included until chosen', () => {
  assert.ok(tmpl.includes('shipBelumPilih'), 'binding for "no shipping chosen" must exist');
  assert.ok(tmpl.includes('Total di atas belum termasuk ongkir'), 'total must disclose excluded shipping');
});
