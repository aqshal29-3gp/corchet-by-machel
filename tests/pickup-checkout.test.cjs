'use strict';
// Pickup (Ambil Sendiri) — checkout frontend. The whole app markup + logic lives
// as a JSON string in the __bundler/template script. We decode it and assert the
// pickup option, the Rp0 ongkir path, the PICKUP shipping payload, and the address
// field hiding are all present and wired.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
assert.ok(m, 'bundler template must be present');
const tmpl = JSON.parse(m[1]);

test('checkout offers a pickup (Ambil Sendiri) method with Rp 0', () => {
  assert.ok(tmpl.includes('Metode pengambilan'), 'method selector label must exist');
  assert.ok(tmpl.includes('Ambil Sendiri'), 'pickup option label must exist');
  assert.ok(tmpl.includes('Tanpa ongkir (Rp 0)'), 'pickup must advertise Rp 0 shipping');
});

test('pickup toggles are bound to handlers', () => {
  assert.ok(tmpl.includes('{{ pickKirim }}'), 'kirim toggle handler bound');
  assert.ok(tmpl.includes('{{ pickPickup }}'), 'pickup toggle handler bound');
  assert.ok(tmpl.includes('pickPickup: () => this.setShip({ pickup: true'), 'pickup setter present');
  assert.ok(tmpl.includes('pickKirim: () => this.setShip({ pickup: false })'), 'kirim setter present');
});

test('address / courier block is hidden when pickup is chosen', () => {
  assert.ok(tmpl.includes('{{ shipShowKirim }}'), 'ship block visibility binding must exist');
  assert.ok(tmpl.includes('shipShowKirim: !this.state.ship.pickup'), 'ship block hidden while pickup');
  // the address label sits inside the shipShowKirim gate
  const gateIdx = tmpl.indexOf('{{ shipShowKirim }}');
  const addrIdx = tmpl.indexOf('Alamat pengiriman');
  assert.ok(gateIdx > -1 && addrIdx > gateIdx, 'Alamat pengiriman must render after the pickup gate');
});

test('pickup shows an info note that the pickup address comes after payment', () => {
  assert.ok(tmpl.includes('{{ shipPickup }}'), 'pickup note visibility binding must exist');
  assert.ok(/Alamat titik pengambilan kami berikan lewat email/.test(tmpl), 'note must explain address is given after payment');
});

test('ongkir is forced to 0 when pickup is selected', () => {
  assert.ok(tmpl.includes('if (this.state.ship.pickup) return 0;'), 'ongkirBiaya must short-circuit to 0 for pickup');
});

test('shippingPayload sends kurir PICKUP with zero cost and no address', () => {
  assert.ok(tmpl.includes('if (s.pickup) return { tujuan: "", alamat: "", kurir: "PICKUP", layanan: "Ambil Sendiri", biaya: 0, etd: "" };'),
    'pickup payload must be a PICKUP courier with biaya 0');
});

test('total does not warn about excluded shipping when pickup (biaya already known = 0)', () => {
  assert.ok(tmpl.includes('shipBelumPilih: !this.state.ship.pickup && !this.state.ship.pilih'),
    'pickup must count as a chosen shipping (no "belum termasuk ongkir" warning)');
  assert.ok(tmpl.includes('shipSudahPilih: this.state.ship.pickup || !!this.state.ship.pilih'),
    'pickup shows the ongkir line (Gratis)');
});
