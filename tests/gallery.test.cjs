const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const templateMatch = html.match(/<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>/);

test('gallery template and assets completeness', () => {
  assert.ok(templateMatch, 'bundler template exists in index.html');
  const template = JSON.parse(templateMatch[1]);
  
  const logicMatch = template.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(logicMatch, 'component logic exists in template');
  const logic = logicMatch[1];
  
  class DCLogic { constructor(props = {}) { this.props = props; } }
  const React = { createRef: () => ({ current: null }), createElement: () => null };
  const Component = new Function('DCLogic', 'React', `${logic}; return Component;`)(DCLogic, React);
  const app = new Component({});
  
  // Verify initial state has 22 gallery items
  assert.ok(app.state.galeri && app.state.galeri.length === 22, `Expected 22 gallery items in state, got ${app.state.galeri ? app.state.galeri.length : 0}`);
  
  // Verify all 22 image files exist on disk
  app.state.galeri.forEach((g, idx) => {
    assert.ok(g.gambar, `Item ${idx} must have gambar property`);
    assert.ok(g.judul, `Item ${idx} must have judul property`);
    const filePath = path.join(__dirname, '..', g.gambar);
    assert.ok(fs.existsSync(filePath), `File does not exist: ${g.gambar}`);
    const stat = fs.statSync(filePath);
    assert.ok(stat.size > 1000, `File ${g.gambar} is too small (${stat.size} bytes)`);
  });
  
  // Verify rendered values from renderVals
  const vals = app.renderVals();
  assert.equal(vals.galeriAda, true, 'galeriAda should be true');
  assert.equal(vals.galeri.length, 22, 'rendered.galeri should contain 22 items');
  
  // Calculate total column/row grid units
  const totalUnits = vals.galeri.reduce((sum, g) => sum + (g.kolom * g.baris), 0);
  assert.equal(totalUnits, 32, `Expected 32 grid units for 4-column 8-row bento, got ${totalUnits}`);
  
  // Verify zoom handler exists on each item
  vals.galeri.forEach((g, idx) => {
    assert.equal(typeof g.zoom, 'function', `Item ${idx} must have zoom function`);
  });
});
