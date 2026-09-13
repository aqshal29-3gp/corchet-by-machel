'use strict';
// Regression guard: the custom gallery and chat reviews must never depend on the
// Apps Script connector again. It returns 403 to anonymous visitors, which silently
// emptied both sections on the live site.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>\s*<\/body>/);
assert.ok(m, 'bundler template must be present');
const tmpl = JSON.parse(m[1]);

test('content sections read static JSON, not the Apps Script connector', () => {
  assert.ok(tmpl.includes('fetch("galeri-custom.json"'), 'galeri custom must read static JSON');
  assert.ok(tmpl.includes('fetch("review-chat.json"'), 'review chat must read static JSON');
  assert.ok(!tmpl.includes('action=galeriCustom'), 'no Apps Script dependency for galeri custom');
  assert.ok(!tmpl.includes('action=reviewChat'), 'no Apps Script dependency for review chat');
});

test('static content files exist and carry visible rows', () => {
  for (const name of ['galeri-custom.json', 'review-chat.json']) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
    assert.ok(Array.isArray(data.items), `${name} must expose an items array`);
    assert.ok(data.items.length > 0, `${name} must not ship empty`);
    for (const row of data.items) {
      assert.ok(!/^(tidak|no|false|0)$/i.test(String(row.tampil ?? 'ya')), `${name} must exclude hidden rows`);
    }
  }
});
