const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('frontend fetches static currencies.json, not Apps Script action=currencies', () => {
  assert.ok(html.includes('currencies.json'), 'must fetch currencies.json');
  assert.ok(!/action=currencies/.test(html), 'must not depend on Apps Script currencies endpoint');
});

test('currencies.json exists, valid, IDR/SGD/MYR numeric kurs', () => {
  const p = path.join(ROOT, 'currencies.json');
  assert.ok(fs.existsSync(p), 'currencies.json must exist');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.ok(Array.isArray(j.items), 'items array');
  const by = Object.fromEntries(j.items.map(x => [x.kode, x]));
  for (const k of ['IDR', 'SGD', 'MYR']) {
    assert.ok(by[k], `${k} present`);
    assert.strictEqual(typeof by[k].kurs, 'number', `${k} kurs numeric`);
    assert.ok(by[k].kurs > 0, `${k} kurs > 0`);
  }
  assert.strictEqual(by.IDR.kurs, 1, 'IDR base = 1');
});
