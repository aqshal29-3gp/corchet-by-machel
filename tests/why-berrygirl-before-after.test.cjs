const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>\s*<\/body>/);
const tmpl = JSON.parse(match[1]);

test('Berrygirl uses the same gc-* comparison slider as Galeri Custom', () => {
  // one Berrygirl gc-ba instance in the Kenapa Machel Crochet section
  assert.match(tmpl, /class="gc-ba why-berrygirl"/);
  assert.match(tmpl, /class="gc-img gc-jadi" src="\{\{ whyBerrygirl\.after \}\}"/);
  assert.match(tmpl, /class="gc-img gc-req" src="\{\{ whyBerrygirl\.before \}\}"/);
  assert.match(tmpl, /class="gc-tag gc-tag-req">Referensi</);
  assert.match(tmpl, /class="gc-tag gc-tag-jadi">Hasil Rajut</);
  assert.match(tmpl, /class="gc-range" type="range" min="0" max="100" value="50" aria-label="[^"]*Berrygirl[^"]*" sc-camel-on-input="\{\{ gcSlide \}\}"/);
});

test('bespoke why-ba slider styles and handler are removed', () => {
  assert.doesNotMatch(tmpl, /\.why-ba\{/);
  assert.doesNotMatch(tmpl, /whyBaSlide/);
  assert.doesNotMatch(tmpl, /src="assets\/berrygirl-/);
});

test('Berrygirl assets are bound through template props', () => {
  assert.match(tmpl, /whyBerrygirl:\s*\{/);
});
