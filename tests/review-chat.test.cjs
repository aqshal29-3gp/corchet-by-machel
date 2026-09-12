'use strict';
const test=require('node:test');
const assert=require('node:assert');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const m=html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>\s*<\/body>/);
assert.ok(m); const tmpl=JSON.parse(m[1]);

test('ReviewChat starts empty and fetches Sheet endpoint',()=>{
  assert.ok(tmpl.includes('reviewChat: []'));
  assert.ok(tmpl.includes('this.loadReviewChat();'));
  assert.ok(tmpl.includes('loadReviewChat() {'));
  assert.ok(tmpl.includes('action=reviewChat'));
  assert.ok(tmpl.includes('this.setState({ reviewChat: items })'));
});

test('ReviewChat remains distinct from verified web reviews',()=>{
  assert.ok(tmpl.includes('class="rc-section"'));
  assert.ok(tmpl.includes('Review dari Chat Pelanggan'));
  assert.ok(tmpl.includes('Ulasan pelanggan dari WhatsApp, Instagram, dan kanal lainnya.'));
  assert.ok(tmpl.includes('id="testimoni"'));
});

test('ReviewChat uses three vertical columns with reverse middle',()=>{
  assert.ok(tmpl.includes('class="rc-columns"'));
  assert.ok(tmpl.includes('class="rc-column rc-column-a"'));
  assert.ok(tmpl.includes('class="rc-column rc-column-b"'));
  assert.ok(tmpl.includes('class="rc-column rc-column-c"'));
  assert.ok(tmpl.includes('@keyframes rcUp'));
  assert.ok(tmpl.includes('@keyframes rcDown'));
});

test('ReviewChat images are accessible and open lightbox',()=>{
  assert.ok(tmpl.includes('alt="{{ rc.alt }}"'));
  assert.ok(tmpl.includes('sc-camel-on-click="{{ rc.zoom }}"'));
  assert.ok(tmpl.includes('loading="lazy"'));
});

test('ReviewChat respects reduced motion and mobile overflow',()=>{
  assert.ok(tmpl.includes('@media (prefers-relify-motion: reduce)') || tmpl.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(tmpl.includes('.rc-track{animation:none'));
  assert.ok(tmpl.includes('@media (max-width:520px)'));
  assert.ok(tmpl.includes('scroll-slk') || tmpl.includes('scroll-snape') || tmpl.includes('overflow-x:auto'));
});

test('ReviewChat ships no dummy screenshot data',()=>{
  assert.ok(!tmpl.includes('DEFAULT_REVIEW_CHAT'));
});
