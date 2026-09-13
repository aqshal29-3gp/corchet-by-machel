const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = JSON.parse(html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>\s*<\/body>/)[1]);
test('invoice creation never emits a paid purchase', () => {
 const method = source.slice(source.indexOf('  handlePay ='), source.indexOf('  payFallback('));
 assert.ok(!method.includes('this.lacakKonversi('));
});
test('uncertain invoice fallback preserves ID without another order write', () => {
 const method = source.slice(source.indexOf('  handleCheckout ='), source.indexOf('  handlePay ='));
 const fn = new Function('return (' + method.trim().replace(/^handleCheckout = /, '').replace(/;$/, '') + ')')();
 const recorded = []; const opened = [];
 const owner = {state:{cart:[{name:'Fixture',qty:1,price:100,priceLabel:'100'}],buyer:{name:'Fixture',phone:'0',email:'fixture.invalid'}},catatStat(){},cekBiodata(){return {}},setState(){},itemPo(){return false},shippingPayload(){return null},buatOrderId(){throw Error('must preserve existing ID')},recordOrder(...args){recorded.push(args)},waText(v){return v}};
 // Arrow function needs lexical this, evaluated with a bound factory.
 const bound = new Function('window','navigator','return (' + method.trim().replace(/^handleCheckout = /, '').replace(/;$/, '') + ')').call(owner,{open:u=>opened.push(u)},{});
 bound('EXISTING-ID');
 assert.equal(recorded.length,0);
 assert.ok(opened[0].includes('EXISTING-ID'));
 assert.ok(source.includes('this.handleCheckout(orderId)'));
});
