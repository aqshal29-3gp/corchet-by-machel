const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('preview metadata uses a versioned image URL', () => {
  assert.match(index, /https:\/\/machelcrochet\.my\.id\/assets\/og-image-3f4236f\.png/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'og-image-3f4236f.png')));
});
