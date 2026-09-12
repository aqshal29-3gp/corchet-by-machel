const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>\s*<\/body>/);
const tmpl = JSON.parse(match[1]);

test('Berrygirl URLs use template bindings accepted by the site bundler', () => {
  assert.match(tmpl, /whyBerrygirl:\s*\{/);
  assert.match(tmpl, /src="\{\{ whyBerrygirl\.before \}\}"/);
  assert.match(tmpl, /src="\{\{ whyBerrygirl\.after \}\}"/);
  assert.doesNotMatch(tmpl, /src="assets\/berrygirl-/);
});

test('Kenapa Machel Crochet opens with accessible Berrygirl comparison', () => {
  assert.match(tmpl, /class="why-ba"/);
  assert.match(tmpl, /class="why-ba-range" type="range" min="0" max="100" value="50"/);
  assert.match(tmpl, /aria-label="Geser untuk membandingkan referensi dan hasil boneka Berrygirl"/);
  assert.match(tmpl, />Referensi</);
  assert.match(tmpl, />Hasil Rajut</);
});

test('Berrygirl comparison is clipped left-to-right and responsive', () => {
  assert.match(tmpl, /\.why-ba-clip\{[^}]*width:var\(--why-ba-pos\)/);
  assert.match(tmpl, /\.why-ba\{[^}]*aspect-ratio:/);
  assert.match(tmpl, /@media\(max-width:700px\)[^{]*\{[\s\S]*?\.why-ba\{/);
  assert.match(tmpl, /\.why-ba-range:focus-visible/);
});
