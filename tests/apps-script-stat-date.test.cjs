// Regresi: kolom tanggal di Sheets terbaca sebagai Date, bukan string.
// Perbandingan String(rows[i][0]) === 'yyyy-MM-dd' selalu gagal, sehingga
// statistik menambah baris baru tiap kunjungan dan filter rentang hari
// tidak menyaring apa pun. Test ini menjaga helper normalisasi tetap ada
// dan dipakai di ketiga tempat yang membaca kolom tanggal Statistik.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const GS = path.join(__dirname, '..', 'AppsScript-GaleriCustom.gs');
const src = fs.readFileSync(GS, 'utf8');

test('helper tglKunci_ tersedia dan menangani Date, serial angka, dan teks', () => {
  assert.match(src, /function tglKunci_\(v\)\s*\{/, 'helper tglKunci_ harus ada');
  assert.match(src, /v instanceof Date/, 'harus mengenali objek Date');
  assert.match(src, /typeof v === 'number'/, 'harus mengenali serial angka');
  assert.match(src, /\\d\{4\}/, 'harus mengenali teks yyyy-mm-dd');
});

test('handleStat membandingkan tanggal lewat tglKunci_, bukan String()', () => {
  const blok = src.slice(src.indexOf('function handleStat(d)'), src.indexOf('function statObjek('));
  assert.ok(blok.length > 0, 'blok handleStat harus ditemukan');
  assert.match(blok, /tglKunci_\(rows\[i\]\[0\]\) === tgl/, 'perbandingan wajib memakai tglKunci_');
  assert.doesNotMatch(blok, /String\(rows\[i\]\[0\]\) === tgl/, 'perbandingan String() mentah dilarang');
});

test('statObjek menormalkan tanggal sebelum memfilter rentang hari', () => {
  const blok = src.slice(src.indexOf('function statObjek('), src.indexOf('function ringkasanStatistik('));
  assert.match(blok, /const tgl = tglKunci_\(rows\[i\]\[0\]\)/, 'statObjek wajib memakai tglKunci_');
  assert.match(blok, /tgl < batas/, 'filter batas hari harus tetap ada');
});

test('ringkasanStatistik juga memakai normalisasi tanggal', () => {
  const blok = src.slice(src.indexOf('function ringkasanStatistik('));
  assert.match(blok, /tglKunci_\(rows\[i\]\[0\]\)/, 'menu ringkasan wajib memakai tglKunci_');
});

test('tidak ada perbandingan tanggal mentah yang tersisa di jalur statistik', () => {
  const mentah = src.match(/String\(rows\[i\]\[0\]\)\s*[<>=]/g) || [];
  assert.deepStrictEqual(mentah, [], 'masih ada perbandingan String(rows[i][0])');
});
