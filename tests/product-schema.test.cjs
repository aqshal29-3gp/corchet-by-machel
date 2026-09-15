const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const template = JSON.parse(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const method = template.slice(template.indexOf('  suntikProdukLD(items) {'), template.indexOf('  /** Nilai untuk panel detail.'));
function render(reviews, names = ['Koya – RM (Kim Namjoon)', 'Koya', 'Tanpa ulasan']) {
  let output;
  const document = { createElement: () => ({}), head: { appendChild: s => { output = JSON.parse(s.textContent); } } };
  const app = new Function('document', 'return ({' + method + '})')(document);
  Object.assign(app, { state: { reviews }, props: {}, slugKe: n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') });
  app.suntikProdukLD(names.map(name => ({ name, priceRaw: 100, qty: 1, images: [['https://example.com/photo.jpg']] })));
  return output.itemListElement.map(x => x.item);
}
const row = { produk: 'Koya – RM (Kim Namjoon)', nama: ' Test author ', ulasan: ' Test review body. ', rating: '5', tanggal: '20/08/2026' };
test('real row fields survive schema generation; no cross-product attribution', () => {
  const [koya, short, empty] = render([row]);
  assert.equal(koya.review?.length, 1);
  assert.equal(koya.review[0].author.name, row.nama);
  assert.equal(koya.review[0].reviewBody, row.ulasan);
  assert.equal(koya.review[0].datePublished, '2026-08-20');
  assert.equal(koya.review[0].reviewRating.ratingValue, 5);
  assert.equal(koya.aggregateRating.reviewCount, 1);
  assert.ok(koya.offers);
  for (const p of [short, empty]) { assert.equal(p.review, undefined); assert.equal(p.aggregateRating, undefined); assert.ok(p.offers); }
});
test('invalid rows omitted, dates validated, five newest reviews only', () => {
  for (const tanggal of ['', '31/02/2026', '29/02/2025', 'bad']) {
    assert.equal(render([{ ...row, tanggal }])[0].review[0].datePublished, undefined);
  }
  assert.equal(render([{ ...row, tanggal: '29/02/2024' }])[0].review[0].datePublished, '2024-02-29');
  for (const change of [{ nama: '' }, { nama: ' ' }, { rating: '5abc' }, { rating: 6 }, { rating: 0 }, { ulasan: '' }]) {
    const product = render([{ ...row, ...change }])[0];
    assert.equal(product.review, undefined);
    assert.equal(product.aggregateRating, undefined);
  }
  const reviews = Array.from({ length: 7 }, (_, i) => ({ ...row, tanggal: `0${i + 1}/08/2026` }));
  const p = render(reviews)[0];
  assert.equal(p.review.length, 5);
  assert.equal(p.review[0].datePublished, '2026-08-07');
  assert.equal(p.review[4].datePublished, '2026-08-03');
  assert.equal(p.aggregateRating.reviewCount, 7);
  assert.equal(render([])[0].review, undefined);
});
module.exports = { render };
