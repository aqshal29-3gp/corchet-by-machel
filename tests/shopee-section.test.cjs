'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>\s*<\/body>/);
assert.ok(match, 'template script must exist');
const tmpl = JSON.parse(match[1]);

test('shopee section exists with official store URL and product list bindings', () => {
  assert.ok(tmpl.includes('<section id="shopee"'), 'shopee section must exist');
  assert.ok(tmpl.includes('href="#shopee"'), 'navbar link to #shopee must exist');
  assert.ok(tmpl.includes('shopeeStoreUrl: "https://shopee.co.id/shop/56653286"'), 'official Shopee store URL must be configured');
  assert.ok(tmpl.includes('<sc-for list="{{ shopeeItems }}" as="sp"'), 'shopeeItems loop must exist');
  assert.ok(tmpl.includes('href="{{ sp.shopeeLink }}"'), 'product Shopee link binding must exist');
  assert.ok(tmpl.includes('href="{{ detailShopee }}"'), 'detail modal Shopee link binding must exist');
});

test('normalize validates Shopee HTTPS URLs and falls back for BerryGirl', () => {
  const logic = tmpl.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  class DCLogic { constructor(props = {}) { this.props = props; } }
  const React = { createRef: () => ({ current: null }), createElement: () => null };
  const Component = new Function('DCLogic', 'React', `${logic}; return Component;`)(DCLogic, React);
  const app = new Component({});

  const berry = app.normalize({ nama: 'BerryGirl', harga: '125.000', stok: '0', gambar: '' });
  assert.match(berry.shopeeLink, /^https:\/\/shopee\.co\.id\/-Machel-Strawberry-Shortcake-.*i\.56653286\.40633799839/);

  const customShopee = app.normalize({
    nama: 'Koya',
    harga: '100.000',
    stok: '2',
    link_shopee: 'https://shopee.co.id/product/56653286/123456'
  });
  assert.equal(customShopee.shopeeLink, 'https://shopee.co.id/product/56653286/123456');

  const malicious = app.normalize({
    nama: 'Koya',
    harga: '100.000',
    stok: '2',
    link_shopee: 'javascript:alert(1)'
  });
  assert.equal(malicious.shopeeLink, '');
});
