'use strict';
// Pickup (Ambil Sendiri) — Apps Script connector logic.
// Verifies the pure helpers that shape order routing and buyer/owner emails for
// pickup orders (kurir = PICKUP), without touching Google services. Functions are
// sliced out of the connector and evaluated with a controllable ALAMAT_STUDIO.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const gs = fs.readFileSync(path.join(__dirname, '..', 'AppsScript-GaleriCustom.gs'), 'utf8');

function sliceFn(src, startNeedle, endNeedle) {
  const a = src.indexOf(startNeedle);
  assert.ok(a > -1, 'missing start: ' + startNeedle);
  const b = src.indexOf(endNeedle, a);
  assert.ok(b > -1, 'missing end: ' + endNeedle);
  return src.slice(a, b);
}

// Build a small module exposing the helpers. NAMA_TOKO/ALAMAT_STUDIO injected.
function build(alamatStudio) {
  const code =
    'const ALAMAT_STUDIO = ' + JSON.stringify(alamatStudio) + ';\n' +
    sliceFn(gs, 'function isPickup(', 'function blokPengirimanOwner(') +
    sliceFn(gs, 'function blokPengirimanOwner(', '/**\n * Email "pesanan diterima"') +
    'module.exports = { isPickup, blokPickupPembeli, blokPengirimanOwner };\n';
  const m = { exports: {} };
  new Function('module', code)(m);
  return m.exports;
}

test('isPickup detects the PICKUP courier flag (case-insensitive), ignores real couriers', () => {
  const { isPickup } = build('');
  assert.strictEqual(isPickup({ kurir: 'PICKUP', layanan: 'Ambil Sendiri' }), true);
  assert.strictEqual(isPickup({ kurir: 'pickup' }), true);
  assert.strictEqual(isPickup({ kurir: 'jne', layanan: 'REG' }), false);
  assert.strictEqual(isPickup({ alamat: 'Jl. X' }), false);
  assert.strictEqual(isPickup(null), false);
});

test('owner email block marks pickup instead of a shipping address', () => {
  const { blokPengirimanOwner } = build('Studio Machel, Jl. Mawar 1');
  const out = blokPengirimanOwner({ kurir: 'PICKUP', layanan: 'Ambil Sendiri', alamat: '', biaya: 0 });
  assert.match(out, /AMBIL SENDIRI \(PICKUP\)/);
  assert.ok(!/ALAMAT KIRIM/.test(out), 'pickup must not print a courier shipping address');
});

test('buyer pickup block shows studio address when configured', () => {
  const { blokPickupPembeli } = build('Studio Machel, Jl. Mawar 1, Bandung');
  const out = blokPickupPembeli();
  assert.match(out, /Ambil Sendiri/);
  assert.match(out, /Studio Machel, Jl\. Mawar 1, Bandung/);
  assert.ok(!/resi|No\. Resi|kurir/i.test(out), 'pickup buyer block must not mention resi/courier');
});

test('buyer pickup block falls back to WhatsApp when no studio address set', () => {
  const { blokPickupPembeli } = build('');
  const out = blokPickupPembeli();
  assert.match(out, /WhatsApp/);
  assert.ok(!/undefined/.test(out));
});

test('pickup stage messages redefine SIAP KIRIM as ready-to-pick-up, DIKIRIM as picked up', () => {
  const m = gs.match(/const PESAN_TAHAP_PICKUP = (\{[\s\S]*?\});/);
  assert.ok(m, 'PESAN_TAHAP_PICKUP must exist');
  const map = eval('(' + m[1] + ')');
  assert.match(map['SIAP KIRIM'].judul, /bisa diambil/i);
  assert.ok(!/dikirim|kurir/i.test(map['SIAP KIRIM'].isi), 'pickup ready copy must not mention courier/shipping');
  assert.match(map['DIKIRIM'].judul, /diambil/i);
  assert.match(map['SELESAI'].judul, /selesai/i);
});

test('server price revalidation forces pickup ongkir to 0 even in flat-rate mode', () => {
  // Reproduce validasiHarga with stubbed Google deps and NO RajaOngkir key (flat mode).
  const code =
    'const RAJAONGKIR_API_KEY = "";\n' +
    'const ONGKIR_FLAT = 25000;\n' +
    'const ONGKIR_GRATIS_MIN = 0;\n' +
    'function catatWebhookMeragukan(){}\n' +
    'const T_PRODUK = "Produk";\n' +
    'function sheet(){ return { getDataRange: () => ({ getValues: () => [["nama","harga"]] }) }; }\n' +
    sliceFn(gs, 'function isPickup(', 'function blokPengirimanOwner(').replace(/function blokPickupPembeli[\s\S]*$/, '') +
    sliceFn(gs, 'function validasiHarga(', 'function batasiPesanan(') +
    'module.exports = { validasiHarga };\n';
  const mod = { exports: {} };
  new Function('module', code)(mod);
  const { validasiHarga } = mod.exports;

  const pickupOrder = validasiHarga({
    items: [{ name: 'Boneka', qty: 1, price: 90000 }],
    shipping: { kurir: 'PICKUP', layanan: 'Ambil Sendiri', biaya: 25000, alamat: 'X', tujuan: 'Y' }
  });
  assert.strictEqual(pickupOrder.shipping.biaya, 0, 'pickup ongkir must be forced to 0');
  assert.strictEqual(pickupOrder.shipping.alamat, '', 'pickup must not carry a shipping address');
  assert.strictEqual(pickupOrder.total, 90000, 'total must be product-only for pickup');

  // Non-pickup in flat mode still gets the flat rate (regression).
  const courierOrder = validasiHarga({
    items: [{ name: 'Boneka', qty: 1, price: 90000 }],
    shipping: { kurir: 'jne', layanan: 'REG', biaya: 0, alamat: 'Jl A', tujuan: 'Bandung' }
  });
  assert.strictEqual(courierOrder.shipping.biaya, 25000, 'courier order still charged flat rate');
  assert.strictEqual(courierOrder.total, 115000);
});
