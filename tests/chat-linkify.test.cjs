const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Seluruh app dibungkus dua lapis: <script type="__bundler/template"> berisi
// string JSON dari dokumen, dan di dalamnya <script type="text/x-dc"> berisi
// kode app. Ambil kode app-nya supaya test membaca sumber yang benar.
function kodeApp(sumber) {
  const buka = '<script type="__bundler/template">';
  const i = sumber.indexOf(buka);
  const j = sumber.indexOf('</script>', i);
  assert.ok(i > 0 && j > i, 'template bundler harus ada');
  const dok = JSON.parse(sumber.slice(i + buka.length, j).trim());
  const m = dok.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(m, 'script app (text/x-dc) harus ada');
  return m[1];
}

const app = kodeApp(html);

function blok(fn) {
  const i = app.indexOf(fn + '(t) {');
  assert.ok(i > 0, fn + ' harus ada di app');
  return app.slice(i, app.indexOf('\n  }', i));
}

test('tautan peta & WhatsApp di balasan chat jadi anchor', () => {
  const b = blok('linkifyReply');
  // Sumber ditulis sebagai regex literal, jadi domain tampil dengan backslash.
  for (const domain of ['machelcrochet\\.my\\.id', 'maps\\.google\\.com', 'wa\\.me', 'shopee\\.co\\.id', 'instagram\\.com']) {
    assert.ok(b.includes(domain), 'domain ' + domain + ' harus ikut dikenali');
  }
  assert.ok(b.includes('target: "_blank"'), 'tautan dibuka di tab baru');
  assert.ok(b.includes('rel: "noopener noreferrer"'), 'tautan diberi rel aman');
});

test('tautan asing tidak dijadikan anchor', () => {
  const b = blok('linkifyReply');
  assert.ok(b.includes('if (!cek.test(p)) return p;'), 'yang tidak lolos allowlist tetap teks biasa');
  assert.ok(!b.includes('dangerouslySetInnerHTML'), 'jangan pakai dangerouslySetInnerHTML');
});

test('titik penutup kalimat tidak ikut masuk tautan', () => {
  const b = blok('linkifyReply');
  assert.ok(b.includes('const bersih = p.replace('), 'URL dibersihkan dari tanda baca');
  assert.ok(b.includes('const ekor = p.slice(bersih.length)'), 'sisa tanda baca dikembalikan sebagai teks');
});
