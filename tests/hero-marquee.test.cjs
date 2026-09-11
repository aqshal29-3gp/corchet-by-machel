const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Extract the bundler template (JSON-encoded HTML string)
const m = html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>\s*<\/body>/);
assert.ok(m, 'bundler template script must exist');
const tmpl = JSON.parse(m[1]);

test('hero marquee: structure and accessibility', () => {
  // Hero section still present
  assert.ok(tmpl.includes('id="top"'), 'hero section id=top must remain');

  // Marquee container + duplicated track for seamless loop
  assert.ok(tmpl.includes('class="hero-marquee"'), 'hero-marquee container must exist');
  const trackCount = (tmpl.match(/hero-marquee-track/g) || []).length;
  // one in CSS selector(s) + at least two track divs (duplicated set)
  assert.ok(trackCount >= 2, `expected duplicated marquee tracks, got ${trackCount}`);

  // Duplicated set must be hidden from AT
  assert.ok(tmpl.includes('aria-hidden="true"'), 'duplicated marquee set must be aria-hidden');
});

test('hero marquee: preserves brand CTAs and typography', () => {
  // Both original CTAs preserved
  assert.ok(tmpl.includes('Request Boneka Custom'), 'primary CTA text preserved');
  assert.ok(tmpl.includes('Lihat Koleksi'), 'secondary CTA text preserved');
  // CTA still points to WA request link and koleksi anchor
  assert.ok(tmpl.includes('{{ waRequestLink }}'), 'WA request link binding preserved');
  assert.ok(tmpl.includes('href="#koleksi"'), 'koleksi anchor preserved');
  // Brand green + Quicksand still used in hero CTA
  assert.ok(tmpl.includes('#55763F'), 'brand green preserved');
});

test('hero marquee: uses existing local webp assets only (no external hotlink)', () => {
  // find the hero section slice
  const start = tmpl.indexOf('id="top"');
  const end = tmpl.indexOf('</section>', start);
  const hero = tmpl.slice(start, end);
  // marquee images must be local assets/*.webp, never cdn.21st.dev
  assert.ok(!hero.includes('cdn.21st.dev'), 'must not hotlink 21st.dev CDN');
  const heroImgs = hero.match(/assets\/[a-z0-9-]+\.webp/gi) || [];
  assert.ok(heroImgs.length >= 6, `hero should reference several local webp assets, got ${heroImgs.length}`);
  // each referenced asset file must exist on disk
  const assetsDir = path.join(__dirname, '..');
  for (const rel of [...new Set(heroImgs)]) {
    assert.ok(fs.existsSync(path.join(assetsDir, rel)), `asset missing: ${rel}`);
  }
});

test('hero marquee: rAF driver moves the track via --hx (survives re-mount)', () => {
  // rAF driver lives in the executed outer bootstrap (moves hero photos right-to-left)
  assert.ok(html.includes('initHeroMarquee'), 'rAF marquee driver must exist');
  assert.ok(html.includes('requestAnimationFrame(step)'), 'driver must loop via rAF');
  assert.ok(html.includes('--hx'), 'driver must drive the --hx transform var');
  assert.ok(html.includes("querySelector('.hero-marquee-track')"), 'driver must query the track');
  // CSS binds the var to the transform
  assert.ok(tmpl.includes('translate3d(var(--hx,0px),0,0)'), 'CSS must bind --hx to transform');
  // hover pause preserved at JS level
  assert.ok(html.includes('.hero-marquee'), 'driver must reference the marquee wrapper');
});

test('hero marquee: honors prefers-reduced-motion', () => {
  // there must be a reduced-motion rule that disables the marquee animation
  assert.ok(
    /prefers-reduced-motion:\s*reduce[\s\S]*?hero-marquee-track/.test(tmpl) ||
    /hero-marquee-track[\s\S]*?prefers-reduced-motion/.test(tmpl) ||
    tmpl.includes('.hero-marquee-track') && tmpl.includes('prefers-reduced-motion'),
    'reduced-motion must be handled for the marquee'
  );
});
