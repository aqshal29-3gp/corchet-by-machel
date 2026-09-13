'use strict';
// Store policy: requester names in the custom gallery stay masked (first letter + asterisks).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('galeri custom masks every requester name', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'galeri-custom.json'), 'utf8'));
  for (const row of data.items) {
    const m = String(row.judul || '').match(/\bby\s+(\S+)/i);
    assert.ok(m, `missing "by <name>" in: ${row.judul}`);
    assert.match(m[1], /^.\*+$/, `requester name must be masked, got: ${m[1]}`);
  }
});
