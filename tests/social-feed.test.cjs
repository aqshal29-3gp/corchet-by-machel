const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
const template = JSON.parse(html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>/)[1]);
const logic = template.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
class DCLogic { constructor(props = {}) { this.props = props; } }
const React = { createRef: () => ({ current: null }), createElement: () => null };
const Component = new Function('DCLogic', 'React', `${logic}; return Component;`)(DCLogic, React);
const app = new Component({});

const rows = Array.from({ length: 15 }, (_, i) => ({
  platform: i % 2 ? 'Instagram' : 'Tiktok',
  tipe: 'video',
  judul: `tanggal-${i}`,
  link: i % 2
    ? `https://www.instagram.com/reel/valid_${i}/`
    : `https://www.tiktok.com/@machel.crochet/video/${7000000000000000000n + BigInt(i)}`,
  published_at: `2026-01-${String(i + 1).padStart(2, '0')}`
}));
rows.push({ platform: 'Instagram', tipe: 'video', judul: 'viral', link: 'https://www.instagram.com/reel/viral_real/', viral_score: '23', published_at: '2025-01-01' });
rows.push({ platform: 'Tiktok', tipe: 'video', judul: 'unggulan', link: 'https://www.tiktok.com/@machel.crochet/video/7999999999999999999', featured: 'ya', published_at: '2024-01-01' });
rows.push({ platform: 'Instagram', tipe: 'video', judul: 'jahat', link: 'javascript:alert(1)', featured: 'ya' });
app.state = { ...app.state, social: rows, socFilter: 'Semua' };

const result = app.socialRows(true);
assert.equal(result.length, 12, 'feed dibatasi 12');
assert.equal(result[0].judul, 'unggulan', 'featured/manual paling atas');
assert.equal(result[1].judul, 'viral', 'viral_score nyata sesudah featured');
assert.ok(!result.some(x => x.judul === 'jahat'), 'URL non-HTTPS ditolak');
assert.equal(result[2].judul, 'tanggal-14', 'tanggal terbaru menjadi fallback');
console.log('social-feed: PASS');
