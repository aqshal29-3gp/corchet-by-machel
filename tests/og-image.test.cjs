const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const png = fs.readFileSync(path.join(__dirname, '..', 'assets', 'og-image.png'));
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);

test('Open Graph image uses the declared 1200x630 dimensions', () => {
  assert.deepEqual([width, height], [1200, 630]);
});
