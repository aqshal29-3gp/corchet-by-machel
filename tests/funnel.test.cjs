const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = JSON.parse(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>\s*<\/body>/)[1]);
function harness(options={}) {
 const events=[], opened=[], records=[], ads=[];
 const window={dataLayer:events,open:u=>opened.push(u),location:{href:''}};
 if(options.gtag) window.gtag=(...a)=>ads.push(a);
 if(options.broken) window.dataLayer={push(){throw Error('metrics unavailable')}};
 const chunks=[['  openModal(', '  /**\n   * Satu-satunya'],['  bukaDetail =','  /**\n   * Menyuntikkan'],['  handleCheckout =','  payUrl('],['  lacakCheckout()','  lacakKonversi(']];
 const deepStart=source.indexOf('  terapkanDeepProduk()');
 const deep=source.slice(deepStart,source.indexOf('\n  }',deepStart)+4);
 let methods=chunks.map(([a,b])=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)+a.length))).join('\n');
 methods+='\n'+deep+'\n'+source.slice(source.indexOf('  detailVals('),source.indexOf('  jalankanDiagnosa()'));
 if(source.includes('  trackFunnel(')) methods+=source.slice(source.indexOf('  trackFunnel('),source.indexOf('  openModal('));
 const Class=new Function('window','navigator','fetch','setTimeout','history','location',`return class {${methods}}`)(window,{},()=> options.reject ? Promise.reject(Error('offline')) : Promise.resolve({json:async()=>({ok:true,link:'https://pay.invalid'})}),()=>0,{replaceState(){}},{pathname:'/'});
 const h=new Class();
 Object.assign(h,{props:{googleTagId:'AW-fixture',googleAdsCheckoutLabel:'label',orderApiUrl:options.api?'https://fixture.invalid':''},state:{cart:[],buyer:{name:'PRIVATE',phone:'PRIVATE',email:'PRIVATE'},cartOpen:false,cartStep:1},displayMoney(v){return String(v)},catatStat(){},slugKe(){return 'fixture'},cekBiodata(){return options.invalid?{name:'bad'}:{}},tandaiBiodata(){},shippingPayload(){return null},ongkirBiaya(){return 0},buatOrderId(){return 'PRIVATE-ID'},recordOrder(...a){records.push(a)},payUrl(){return 'https://pay.invalid/private'},orderPayload(){return {}},setState(v){Object.assign(this.state,typeof v==='function'?v(this.state):v)}});
 const bindings=source.slice(source.indexOf('      toggleCart:'),source.indexOf('      addToCart:'));
 h.bindings=()=>new Function('return ({'+bindings+'})').call(h);
 return {h,events,opened,records,ads,window};
}
const item={name:'PRIVATE',kategori:'PRIVATE',qty:2,priceRaw:100,priceLabel:'100',images:[],opts:[]};
const names=e=>e.map(x=>x.event);
test('detail/custom views, additions and cart transitions repeat, not renders',()=>{
 const {h,events}=harness();
 h.bukaDetail(item); h.bukaDetail(item); h.tutupDetail(); h.bukaDetail(item);
 assert.deepEqual(names(events),['view_item','view_item']);
 h.addItem(item); h.addItem(item); h.addItem(item);
 assert.deepEqual(names(events).slice(2),['add_to_cart','view_cart','add_to_cart']);
 h.bindings(); h.bindings(); h.bindings().toggleCart(); h.bindings().toggleCart();
 assert.equal(names(events).filter(x=>x==='view_cart').length,2);
 h.openModal(item); h.addConfigured(); h.openModal(item); h.addConfigured();
 assert.equal(names(events).filter(x=>x==='add_to_cart').length,4);
});
test('legacy add and quantity increment track actual increases only',()=>{
 const {h,events}=harness(); const root={querySelector:()=>({textContent:'PRIVATE'}),querySelectorAll:()=>[]};
 h.handleAdd({currentTarget:root}); h.setQty('PRIVATE',1); h.setQty('missing',1); h.setQty('PRIVATE',-1);
 assert.deepEqual(names(events),['add_to_cart','view_cart','add_to_cart']);
});
test('checkout transition independent of gtag, re-entry allowed',()=>{
 for(const gtag of [false,true]) {const {h,events,ads}=harness({gtag});
 h.bindings().toStep2(); assert.equal(events.length,0);
 h.state.cart=[{...item,price:100}]; h.bindings().toStep2(); h.bindings().toStep2();
 h.bindings().toStep1(); h.bindings().toStep2();
 assert.deepEqual(events,[{event:'begin_checkout'},{event:'begin_checkout'}]);
 assert.equal(ads.filter(a=>a[1]==='conversion').length,gtag?2:0);
 }
});
test('payment handlers: direct, invoice, link fallback, WhatsApp fallback; no duplicate selection',async()=>{
 for(const mode of ['whatsapp','single','invoice','link-fallback','wa-fallback','rejected']) {
 const {h,events,opened,window}=harness({api:mode==='invoice'||mode==='rejected',reject:mode==='rejected'});
 h.state.cart=[{...item,price:100,payLink:mode==='single'||mode==='link-fallback'?'https://private.invalid':''}];
 if(mode==='link-fallback') h.state.cart.push({...item,price:100});
 if(mode==='whatsapp') h.handleCheckout(); else h.handlePay();
 await new Promise(setImmediate);
 const wa=['whatsapp','wa-fallback','rejected'].includes(mode);
 assert.deepEqual(events,[{event:'select_payment_method',payment_method:mode==='whatsapp'?'whatsapp':'payment_link'},{event:wa?'open_whatsapp':'open_payment_link'}],mode);
 assert.equal(opened.length+(window.location.href?1:0),1);
 }
});
test('invalid, empty, busy checkout does not select; throwing metrics cannot block payment',()=>{
 for(const options of [{invalid:true},{}]) {const {h,events}=harness(options);if(options.invalid) h.state.cart=[item];h.handleCheckout();h.handlePay();assert.equal(events.length,0);}
 const {h,events}=harness(); h.state.cart=[item];h.state.paying=true;h.handlePay();assert.equal(events.length,0);
 const b=harness({broken:true}); b.h.state.cart=[{...item,price:100}];assert.doesNotThrow(()=>b.h.handleCheckout());assert.equal(b.opened.length,1);
});
test('tracker rejects unknown events/methods and ignores extra private fields',()=>{
 const {h,events}=harness(); assert.equal(typeof h.trackFunnel,'function');
 h.trackFunnel('PRIVATE');h.trackFunnel('select_payment_method','PRIVATE');
 h.trackFunnel('view_item',{name:'PRIVATE'});h.trackFunnel('select_payment_method','whatsapp',{name:'PRIVATE'});
 assert.deepEqual(events,[{event:'view_item'},{event:'select_payment_method',payment_method:'whatsapp'}]);
});
test('every WhatsApp/payment anchor uses event-only click binding, never URL builders',()=>{
 const anchors=source.match(/<a\b[^>]*href="{{ (?:waLink|waRequestLink|waPatternLink|waAiLink|internationalWaLink|it.waChat|detailWa|trkLinkBayar) }}"[^>]*>/g);
 assert.ok(anchors.length>=20);
 for(const a of anchors) assert.match(a,/sc-camel-on-click="{{ (?:trackWhatsapp|trackPaymentLink) }}"/);
 const {h,events}=harness();h.waText('PRIVATE');h.waProduct(item);assert.equal(events.length,0);
 h.trackWhatsapp();h.trackWhatsapp();h.trackPaymentLink();assert.deepEqual(names(events),['open_whatsapp','open_whatsapp','open_payment_link']);
});
test('deep link resolves once, detail render stays silent and detail add uses real handler',()=>{
 const {h,events}=harness();h.state.rows=[item];h.normalize=x=>x;h._deepProduk='fixture';
 h.terapkanDeepProduk();h.terapkanDeepProduk();h.detailVals([item]);h.detailVals([item]);
 assert.deepEqual(names(events),['view_item']);h.detailVals([item]).detailTambah();
 assert.deepEqual(names(events),['view_item','add_to_cart','view_cart']);
});
test('missing layer initializes; throwing layer preserves Ads and all payment paths',async()=>{
 const a=harness({gtag:true});delete a.window.dataLayer;a.h.lacakCheckout();assert.deepEqual(a.window.dataLayer,[{event:'begin_checkout'}]);
 for(const api of [false,true]) {const b=harness({broken:true,api,gtag:true});b.h.state.cart=[{...item,price:100,payLink:api?'':'https://pay.invalid'}];b.h.lacakCheckout();b.h.handlePay();await new Promise(setImmediate);assert.equal(b.ads.filter(a=>a[1]==='conversion').length,1);assert.equal(b.opened.length+(b.window.location.href?1:0),1);}
});
