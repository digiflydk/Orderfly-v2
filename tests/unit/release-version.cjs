const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { version } = JSON.parse(read('package.json'));

test('the current release number has the newest docs/releases.md entry', () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const first = read('docs/releases.md').split('\n').find((line) => /^\| \d+\.\d+\.\d+ \|/.test(line));
  assert.ok(first, 'docs/releases.md lists releases');
  assert.equal(first.split('|')[1].trim(), version);
});

test('package-lock, build env, health and both admin sidebars carry the release number', () => {
  assert.equal(JSON.parse(read('package-lock.json')).version, version);
  assert.match(read('next.config.js'), /NEXT_PUBLIC_RELEASE_VERSION: require\('\.\/package\.json'\)\.version/);
  assert.match(read('src/app/api/health/route.ts'), /version: process\.env\.NEXT_PUBLIC_RELEASE_VERSION/);
  for (const file of ['src/components/superadmin/sidebar-client.tsx', 'src/components/admin/sidebar.tsx']) {
    assert.match(read(file), /<ReleaseVersion /, file);
  }
});
