const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>\s*<\/body>/);
assert.ok(match, 'template script must exist');
const tmpl = JSON.parse(match[1]);

test('Berrygirl URLs use template bindings accepted by the site bundler', () => {
  assert.match(tmpl, /whyBerrygirl:\s*\{/);
  assert.match(tmpl, /src="\{\{ whyBerrygirl\.before \}\}"/);
  assert.match(tmpl, /src="\{\{ whyBerrygirl\.after \}\}"/);
  assert.doesNotMatch(tmpl, /src="assets\/berrygirl-/);
  assert.match(tmpl, /whyBerrygirl:\s*\{ before: \(globalThis\.location\?\.origin \|\| ""\) \+ "\/assets\/berrygirl-before\.webp", after: \(globalThis\.location\?\.origin \|\| ""\) \+ "\/assets\/berrygirl-after\.webp" \}/);
});

test('Kenapa Machel Crochet uses the polaroid scrapbook, not the drag slider', () => {
  assert.match(tmpl, /class="why-pol"/);
  assert.match(tmpl, /class="why-pol-card why-pol-a"/);
  assert.match(tmpl, /class="why-pol-card why-pol-b"/);

  // slider lama harus benar-benar hilang
  assert.equal(tmpl.includes('why-ba'), false, 'no leftover why-ba classes');
  assert.equal(tmpl.includes('whyBaSlide'), false, 'slider handler must be removed');

  // tidak ada input range di dalam blok polaroid (slider Galeri Custom tetap boleh ada)
  const start = tmpl.indexOf('class="why-pol"');
  const blok = tmpl.slice(start, tmpl.indexOf('class="bento"', start));
  assert.equal(blok.includes('type="range"'), false, 'no range input inside the polaroid block');
});

test('polaroid cards carry tape, handwritten captions and accessible alt text', () => {
  assert.match(tmpl, /class="why-pol-tape" aria-hidden="true"/);
  assert.match(tmpl, /<figcaption>foto dari kamu<\/figcaption>/);
  assert.match(tmpl, /<figcaption>jadi boneka!<\/figcaption>/);
  assert.match(tmpl, /alt="Referensi karakter Berrygirl dari pelanggan"/);
  assert.match(tmpl, /alt="Hasil boneka rajut custom Berrygirl"/);
  // bukti visual tidak boleh lazy: kartu kosong kalau request ditunda
  assert.match(tmpl, /src="\{\{ whyBerrygirl\.before \}\}"[^>]*loading="eager"/);
  assert.match(tmpl, /src="\{\{ whyBerrygirl\.after \}\}"[^>]*loading="eager"/);
});

test('polaroid layout is responsive and honors reduced motion', () => {
  assert.match(tmpl, /\.why-pol\{[^}]*display:flex[^}]*justify-content:center/);
  assert.match(tmpl, /\.why-pol-a\{[^}]*transform:rotate\(-5deg\)/);
  assert.match(tmpl, /\.why-pol-b\{[^}]*transform:rotate\(4deg\)/);
  assert.match(tmpl, /@media\(max-width:760px\)[\s\S]{0,600}\.why-pol-card\{width:min\(196px,47%\)/);
  assert.match(tmpl, /prefers-reduced-motion:reduce\)\{\.why-pol-card\{transition:none\}/);
});

test('polaroid captions are translated for the EN switch', () => {
  assert.match(tmpl, /"foto dari kamu":\s*"your reference photo"/);
  assert.match(tmpl, /"jadi boneka!":\s*"becomes a doll!"/);
});
