const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', js)((name) => dependencies[name] || require(name), module, module.exports);
  return module.exports;
}
const dates = load('src/lib/games/dates.ts');
const { campaignInDateRange } = load('src/lib/games/dashboard-filter.ts', { './dates': dates });
const row = (changes = {}) => ({ brandId: 'brand_a', status: 'scheduled', startsAt: '2026-03-29T08:00:00.000Z', endsAt: '2026-04-01T08:00:00.000Z', createdAt: '2026-03-01T08:00:00.000Z', updatedAt: null, ...changes });

test('campaign period overlaps inclusive Copenhagen calendar dates across daylight saving time', () => {
  assert.equal(campaignInDateRange(row(), '2026-03-29', '2026-03-29'), true);
  assert.equal(campaignInDateRange(row(), '2026-03-28', '2026-03-28'), false);
  assert.equal(campaignInDateRange(row(), '2026-04-01', '2026-04-01'), true);
  assert.equal(campaignInDateRange(row(), '2026-04-02', '2026-04-02'), false);
  assert.equal(campaignInDateRange(row(), '2026-04-02', ''), false);
  assert.equal(campaignInDateRange(row(), '', '2026-03-28'), false);
});

test('an undated live legacy campaign uses its creation and an unscheduled draft has no period', () => {
  const live = row({ status: 'live', startsAt: null, endsAt: null });
  assert.equal(campaignInDateRange(live, '2026-04-02', ''), true);
  assert.equal(campaignInDateRange(live, '', '2026-02-28'), false);
  assert.equal(campaignInDateRange(row({ status: 'draft', startsAt: null, endsAt: null }), '2026-04-02', ''), false);
  assert.equal(campaignInDateRange(row({ status: 'draft', startsAt: null, endsAt: null }), '', ''), true);
});

test('an ended legacy campaign stops at its last update and midnight end is exclusive', () => {
  const ended = row({ status: 'ended', startsAt: null, endsAt: null, updatedAt: '2026-04-01T10:00:00.000Z' });
  assert.equal(campaignInDateRange(ended, '2026-04-02', ''), false);
  assert.equal(campaignInDateRange(ended, '2026-04-01', ''), true);
  const midnight = row({ endsAt: '2026-03-31T22:00:00.000Z' });
  assert.equal(campaignInDateRange(midnight, '2026-04-01', ''), false);
});
