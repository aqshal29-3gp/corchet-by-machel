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
 const recorded = []; const opened = [];
 const owner = {state:{cart:[{name:'Fixture',qty:1,price:100,priceLabel:'100'}],buyer:{name:'Fixture',phone:'0',email:'fixture.invalid'}},catatStat(){},cekBiodata(){return {}},setState(){},itemPo(){return false},shippingPayload(){return null},buatOrderId(){throw Error('must preserve existing ID')},recordOrder(...args){recorded.push(args)},waText(v){return v}};
 // Arrow function needs lexical this, evaluated with a bound factory.
 const bound = new Function('window','navigator','return (' + method.trim().replace(/^handleCheckout = /, '').replace(/;$/, '') + ')').call(owner,{open:u=>opened.push(u)},{});
 bound('EXISTING-ID');
 assert.equal(recorded.length,0);
 assert.ok(opened[0].includes('EXISTING-ID'));
 assert.ok(source.includes('this.handleCheckout(orderId)'));
});

function paymentHarness(fetchResult, timeoutNow=false) {
 const method = source.slice(source.indexOf('  handlePay ='), source.indexOf('  payFallback('));
 const states=[]; const fallbacks=[]; const location={href:''};
 const owner={
  state:{cart:[{name:'A',qty:1,price:100}],buyer:{},paying:false}, props:{orderApiUrl:'https://fixture.invalid'},
  cekBiodata(){return {}}, tandaiBiodata(){}, setState(v){states.push(v);Object.assign(this.state,v)},
  ongkirBiaya(){return 0}, buatOrderId(){return 'ORDER-1'}, orderPayload(){return {}},
  payFallback(...v){fallbacks.push(v)},
 };
 const bound=new Function('fetch','window','setTimeout','return ('+method.trim().replace(/^handlePay = /,'').replace(/;$/,'')+')')
  .call(owner,()=>Promise.resolve(fetchResult),{location},fn=>timeoutNow ? (fn(),0) : 0);
 return {bound,states,fallbacks,location};
}

test('invoice transport success opens provider without Purchase', async () => {
 const h=paymentHarness({json:()=>Promise.resolve({ok:true,link:'https://pay.invalid/i'})});
 h.bound(); await new Promise(setImmediate);
 assert.equal(h.location.href,'https://pay.invalid/i');
 assert.equal(h.fallbacks.length,0);
});

test('invoice transport provider error uses same-ID fallback once', async () => {
 const h=paymentHarness({json:()=>Promise.resolve({ok:false,message:'rejected'})});
 h.bound(); await new Promise(setImmediate);
 assert.deepEqual(h.fallbacks,[['ORDER-1',100,'rejected']]);
});

test('invoice transport timeout uses same-ID fallback once', async () => {
 const h=paymentHarness({json:()=>new Promise(()=>{})},true);
 h.bound(); await new Promise(setImmediate);
 assert.equal(h.fallbacks.length,1);
 assert.equal(h.fallbacks[0][0],'ORDER-1');
});
