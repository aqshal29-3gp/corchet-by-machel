const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>\s*<\/body>/);
const template = JSON.parse(match[1]);
const sitemap = fs.readFileSync(path.join(__dirname, '..', 'sitemap.xml'), 'utf8');

test('Google tag uses the configured Ads account and live labels', () => {
  assert.match(template, /&quot;default&quot;:&quot;AW-18411445297&quot;/);
  assert.match(template, /&quot;default&quot;:&quot;OM28CPLfoegcELG4octE&quot;/);
  assert.match(template, /&quot;default&quot;:&quot;o_o7COG_w-gcELG4octE&quot;/);
  assert.match(template, /window\.gtag\("config", id\)/);
  assert.match(template, /googletagmanager\.com\/gtag\/js\?id=/);
});

test('checkout intent emits begin_checkout with real cart value in IDR', () => {
  assert.match(template, /lacakCheckout\(\)/);
  assert.match(template, /window\.gtag\("event", "begin_checkout", \{ value: nilai, currency: "IDR" \}\)/);
  assert.match(template, /const nilai = this\.state\.cart\.reduce/);
});

test('invoice response does not claim payment completed', () => {
  assert.doesNotMatch(template, /this\.lacakKonversi\(orderId, total, "Invoice gabungan"\)/);
});

test('landing URLs are canonical HTTPS URLs', () => {
  assert.match(template, /<link rel="canonical" href="https:\/\/machelcrochet\.my\.id\/">/);
  assert.doesNotMatch(sitemap, /<loc>http:\/\//);
});
