const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const gs = fs.readFileSync(path.join(__dirname, '..', 'AppsScript-GaleriCustom.gs'), 'utf8');

test('chat punya lapisan jawaban cepat dari spreadsheet', () => {
  assert.match(gs, /function katalogData\(\)/, 'katalogData() menyusun data produk terstruktur');
  assert.match(gs, /function katalogChat\(/, 'katalogChat() menyusun teks katalog untuk prompt');
  assert.match(gs, /function jawabCepat\(/, 'jawabCepat() menjawab pertanyaan data tanpa model');
  assert.match(gs, /function cariProduk\(/, 'cariProduk() mencocokkan nama produk');
  assert.match(gs, /function jawabProduk\(/, 'jawabProduk() menyusun harga + status + link');
});

test('handleChat menjawab data sebelum memanggil model', () => {
  const badan = gs.slice(gs.indexOf('function handleChat('));
  const blok = badan.slice(0, badan.indexOf('function catatChat('));
  const posCepat = blok.indexOf('jawabCepat(pesan)');
  const posModel = blok.indexOf('panggilGeminiTeks(');
  assert.ok(posCepat > 0, 'jawabCepat dipanggil di handleChat');
  assert.ok(posModel > 0, 'panggilGeminiTeks dipanggil di handleChat');
  assert.ok(posCepat < posModel, 'jawaban data harus dicek sebelum model dipanggil');
  assert.match(blok, /balas\(cepat, 'data'\)/, 'respons menandai jawaban dari data');
  assert.match(blok, /balas\('[^']*', 'sapaan'\)/, 'sapaan dijawab tanpa model');
});

test('katalog prompt memuat semua produk, tidak dipotong', () => {
  const blok = gs.slice(gs.indexOf('function katalogChat('), gs.indexOf('/** Fakta toko'));
  assert.ok(!/slice\(0,\s*\d{4,}\)/.test(blok), 'katalogChat tidak boleh memotong daftar produk');
  assert.match(blok, /daftar\.map\(/, 'semua produk dipetakan jadi baris');
});

test('panggilan model: thinking dimatikan dan token dibatasi', () => {
  assert.match(gs, /thinkingBudget:\s*0/, 'thinking dimatikan supaya jawaban pendek cepat');
  assert.match(gs, /maxOutputTokens/, 'jumlah token keluaran dibatasi');
  assert.match(gs, /function panggilSatuModel\(/, 'ada pemanggilan per model');
  assert.match(gs, /function panggilGeminiTeks\(/, 'ada rantai fallback antar model');
});

test('catatChat menulis dengan setValues, bukan appendRow', () => {
  const mulai = gs.indexOf('function catatChat(');
  const blok = gs.slice(mulai, gs.indexOf('\n}\n', mulai) + 3);
  assert.match(blok, /setValues\(/, 'memakai setValues');
  assert.ok(!/appendRow\(/.test(blok), 'appendRow memindai seluruh sheet dan lambat');
});
