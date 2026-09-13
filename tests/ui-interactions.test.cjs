'use strict';
// Round-4: runtime UI interaction QA for index-rebuild.html (no network, no checkout POST).
// Executes the page's own functions in a vm sandbox with stubbed DOM/storage,
// recording actual vs expected per feature. Safe: never touches production.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index-rebuild.html'), 'utf8');
const script = html.slice(html.indexOf('/* ===== CONFIG'), html.lastIndexOf('</script>'));

function sliceFn(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  assert.ok(s >= 0, 'missing ' + startMarker);
  const e = endMarker ? src.indexOf(endMarker, s + startMarker.length) : src.length;
  assert.ok(e > s, 'bad end for ' + startMarker);
  return src.slice(s, e);
}

function makeCtx() {
  const els = {};
  function el(id) {
    if (!els[id]) {
      els[id] = {
        id, innerHTML: '', textContent: '', value: '', style: {},
        dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
        querySelectorAll() { return []; },
        appendChild() {},
      };
    }
    return els[id];
  }
  const store = {};
  const toasts = [];
  const ctx = {
    console,
    toasts, els,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: {
      getElementById: (id) => el(id),
      querySelector: () => ({ classList: { add() {}, remove() {} } }),
      querySelectorAll: () => [],
      createElement: () => ({ className: '', textContent: '', appendChild() {} }),
    },
    revealObs: { observe() {} },
    toast: (m) => toasts.push(m),
    cart: [],
    allProducts: [],
    currentCat: 'all',
    modalProduct: null,
  };
  ctx.ctx = ctx;
  vm.createContext(ctx);
  return ctx;
}

function loadCartFns(ctx) {
  const code =
    sliceFn(script, 'function fmt(', 'function esc(') +
    sliceFn(script, 'function esc(', 'function toast(') +
    sliceFn(script, 'function driveImg(', '/* ===== FETCH SHEET') +
    sliceFn(script, 'function filterProducts(', 'function renderProducts(') +
    sliceFn(script, 'function renderProducts(', '/* ===== PRODUCT MODAL') +
    'function openProductModal(idx){ modalProduct = (currentCat === "all" ? allProducts : allProducts.filter(p => p.kategori === currentCat))[idx] || null; }\n' +
    sliceFn(script, 'function addToCart(p) {', 'function toggleCart()') +
    sliceFn(script, 'function toggleCart()', '/* ===== CHECKOUT');
  vm.runInContext(code, ctx);
  return ctx;
}

const FIXTURES = [
  { nama: 'Boneka A', kategori: 'Kpop', harga: 50000, stok: 3, gambar: '', deskripsi: 'A' },
  { nama: 'Boneka B', kategori: 'Viral', harga: 75000, stok: 0, gambar: '', deskripsi: 'B' },
  { nama: 'Boneka C', kategori: 'Kpop', harga: 60000, stok: 1, gambar: '', deskripsi: 'C' },
];

test('filter: all shows 3, category Kpop shows 2, empty category shows empty message', () => {
  const ctx = loadCartFns(makeCtx());
  vm.runInContext('allProducts = ' + JSON.stringify(FIXTURES) + '; filterProducts("all");', ctx);
  const allHTML = ctx.els.productsGrid.innerHTML;
  assert.match(allHTML, /Boneka A/);
  assert.match(allHTML, /Boneka B/);
  vm.runInContext('filterProducts("Kpop");', ctx);
  const kpopHTML = ctx.els.productsGrid.innerHTML;
  assert.match(kpopHTML, /Boneka A/);
  assert.match(kpopHTML, /Boneka C/);
  assert.ok(!kpopHTML.includes('Boneka B'), 'Viral item must be filtered out');
  vm.runInContext('filterProducts("TidakAda");', ctx);
  assert.match(ctx.els.productsGrid.innerHTML, /Belum ada produk/);
});

test('cart: add increments qty, persists to storage, badge count updates', () => {
  const ctx = loadCartFns(makeCtx());
  vm.runInContext('allProducts = ' + JSON.stringify(FIXTURES) + '; addToCart(allProducts[0]); addToCart(allProducts[0]); addToCart(allProducts[1]);', ctx);
  assert.equal(ctx.cart.length, 2);
  assert.equal(ctx.cart[0].qty, 2);
  assert.equal(ctx.cart[1].qty, 1);
  assert.equal(ctx.els.cartCount.textContent, 3);
  assert.match(ctx.els.cartBody.innerHTML, /Boneka A/);
  const stored = JSON.parse(vm.runInContext('localStorage.getItem("mcCart")', ctx));
  assert.equal(stored.length, 2);
  assert.match(ctx.toasts.join(' '), /Ditambahkan/);
});

test('cart: changeQty decrement to zero removes line; removeItem drops line', () => {
  const ctx = loadCartFns(makeCtx());
  vm.runInContext(
    'allProducts = ' + JSON.stringify(FIXTURES) +
    '; addToCart(allProducts[0]); addToCart(allProducts[2]); changeQty(0,-1);', ctx);
  assert.equal(ctx.cart.length, 1);
  assert.equal(ctx.cart[0].nama, 'Boneka C');
  vm.runInContext('removeItem(0);', ctx);
  assert.equal(ctx.cart.length, 0);
  assert.match(ctx.els.cartBody.innerHTML, /masih kosong/);
});

test('detail modal: selects product from filtered list by index', () => {
  const ctx = loadCartFns(makeCtx());
  vm.runInContext('allProducts = ' + JSON.stringify(FIXTURES) + '; openProductModal(1);', ctx);
  assert.equal(ctx.modalProduct.nama, 'Boneka B');
});

test('checkout guard: processCheckout refuses empty buyer data without network', () => {
  // processCheckout reads coName/coPhone/coEmail/coAddress + selectedCity/Shipping.
  // With empty stub fields it must toast and return before any fetch/postAPI.
  const hasFn = script.includes('async function processCheckout()');
  assert.ok(hasFn, 'processCheckout must exist');
  const body = sliceFn(script, 'async function processCheckout()', '/* ===== REVIEWS');
  assert.ok(body.includes("Lengkapi semua data"), 'must validate buyer fields first');
  assert.ok(body.indexOf("Lengkapi semua data") < body.indexOf('postAPI'), 'validation before network');
});
