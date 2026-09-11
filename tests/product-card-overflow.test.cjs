const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const bundle = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = bundle.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>/);
assert.ok(match, 'index.html contains the bundled storefront template');
const html = JSON.parse(match[1]);

test('floating cart button is not clipped by its image parent', () => {
  assert.match(html, /\.product-card-img\{[^}]*overflow:visible/);
  assert.match(html, /\.product-card-img>img\{[^}]*border-radius:/);
});
