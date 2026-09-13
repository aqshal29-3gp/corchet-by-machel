const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('bundler template has no unescaped </script> inside template script tag', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const tag = '<script type="__bundler/template">';
  const start = html.indexOf(tag) + tag.length;
  const end = html.lastIndexOf('</script>');
  assert.ok(start > tag.length, 'Template script tag must exist');
  assert.ok(end > start, 'Closing script tag must exist');
  const body = html.slice(start, end).trim();
  assert.equal(
    body.includes('</script>'),
    false,
    'Found unescaped </script> inside bundler template which prematurely closes script tag in browser HTML parser'
  );
  // Also verify it parses cleanly as JSON
  assert.doesNotThrow(() => {
    JSON.parse(body);
  }, 'Template body must be valid JSON');
});
