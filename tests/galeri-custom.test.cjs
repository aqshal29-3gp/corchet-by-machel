'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>\s*<\/body>/);
assert.ok(m, 'template script must exist');
const tmpl = JSON.parse(m[1]);

test('galeri custom: default fallback data present', () => {
  assert.ok(tmpl.includes('DEFAULT_GALERI_CUSTOM'), 'DEFAULT_GALERI_CUSTOM must exist');
  assert.ok(tmpl.includes('galeriCustom: DEFAULT_GALERI_CUSTOM'), 'state must init galeriCustom');
  // 3 sample items with both photos
  const idx = tmpl.indexOf('const DEFAULT_GALERI_CUSTOM = [');
  const seg = tmpl.slice(idx, tmpl.indexOf('];', idx));
  assert.strictEqual((seg.match(/fotoRequest/g) || []).length, 3, '3 sample fotoRequest');
  assert.strictEqual((seg.match(/fotoJadi/g) || []).length, 3, '3 sample fotoJadi');
});

test('galeri custom: pulls from Sheet via Apps Script action', () => {
  assert.ok(tmpl.includes('loadGaleriCustom() {'), 'loadGaleriCustom method must exist');
  assert.ok(tmpl.includes('action=galeriCustom'), 'must fetch action=galeriCustom');
  assert.ok(tmpl.includes('this.loadGaleriCustom();'), 'must call loadGaleriCustom on init');
  assert.ok(tmpl.includes('this.setState({ galeriCustom: items })'), 'must set galeriCustom state from items');
});

test('galeri custom: derived props map both photos', () => {
  assert.ok(tmpl.includes('galeriCustomAda:'), 'galeriCustomAda derived flag');
  assert.ok(tmpl.includes('fotoRequest: this.imageCandidates'), 'maps fotoRequest via imageCandidates');
  assert.ok(tmpl.includes('fotoJadi: this.imageCandidates'), 'maps fotoJadi via imageCandidates');
  assert.ok(tmpl.includes('g.fotorequest'), 'accepts lowercase sheet header fotorequest');
  assert.ok(tmpl.includes('g.fotojadi'), 'accepts lowercase sheet header fotojadi');
});

test('galeri custom: before/after slider markup + handler', () => {
  assert.ok(tmpl.includes('class="gc-sub"'), 'sub-section wrapper');
  assert.ok(tmpl.includes('>Galeri Custom<'), 'sub-section title text');
  assert.ok(tmpl.includes('class="gc-range"'), 'range input for slider');
  assert.ok(tmpl.includes('class="gc-clip"'), 'clip element driven by --gc-pos');
  assert.ok(tmpl.includes('gcSlide:'), 'gcSlide handler defined');
  assert.ok(tmpl.includes('--gc-pos'), 'CSS var for slider position');
  // both tags present
  assert.ok(tmpl.includes('gc-tag-req') && tmpl.includes('gc-tag-jadi'), 'Request + Jadi tags');
});

test('galeri custom: CSS present, responsive, reduced-motion', () => {
  assert.ok(tmpl.includes('.gc-sub{'), 'gc CSS block exists');
  assert.ok(tmpl.includes('.gc-grid{display:grid;grid-template-columns:repeat(3,1fr)'), '3-col grid desktop');
  assert.ok(tmpl.includes('@media (max-width:860px){.gc-grid{grid-template-columns:repeat(2,1fr)'), 'tablet 2-col');
  assert.ok(tmpl.includes('@media (max-width:520px){.gc-grid{grid-template-columns:1fr}'), 'mobile 1-col');
  assert.ok(tmpl.includes('aspect-ratio:3/4'), 'portrait cards');
  assert.ok(tmpl.includes('prefers-reduced-motion: reduce){.gc-img'), 'reduced-motion honored');
});

test('galeri custom: no em-dash anywhere in sub-section (anti-slop)', () => {
  const gi = tmpl.indexOf('class="gc-sub"');
  const seg = tmpl.slice(gi, gi + 2000);
  assert.ok(!seg.includes('\u2014'), 'no em-dash in sub-section markup');
  assert.ok(!seg.includes('\u2013'), 'no en-dash separator in sub-section markup');
});
