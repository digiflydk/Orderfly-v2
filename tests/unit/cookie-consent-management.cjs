const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

function fixture(allowed = true) {
  const calls = [];
  const timestamp = value => ({toDate: () => new Date(value)});
  const rows = [
    {id:'before', data:() => ({last_seen:timestamp('2026-09-20T21:59:59Z')})},
    {id:'start', data:() => ({last_seen:timestamp('2026-09-20T22:00:00Z')})},
    {id:'end', data:() => ({last_seen:timestamp('2026-09-21T21:59:59.999Z')})},
    {id:'next', data:() => ({last_seen:timestamp('2026-09-21T22:00:00Z')})},
  ];
  const predicates = [];
  const query = {
    where(field, operator, value) { calls.push([field, operator, value.toISOString()]); predicates.push(data => operator === '>=' ? data[field].toDate() >= value : data[field].toDate() < value); return this; },
    orderBy(...args) { calls.push(args); return this; },
    async get() { return {docs:rows.filter(row => predicates.every(predicate => predicate(row.data())))}; },
  };
  const api = loadTs('src/app/superadmin/analytics/cookies/actions.ts', {
    '@/lib/access/orderfly-session': {requirePlatformSuperuser:async () => { if (!allowed) throw Error('forbidden'); }},
    '@/lib/firebase-admin': {getAdminDb() { calls.push('db'); return {collection(name) { calls.push(name); return query; }}; }},
    'firebase-admin': {firestore:{Timestamp:{fromDate:date => date}}},
  });
  return {api, calls};
}

test('cookie reads reject non-superusers before touching the database', async () => {
  const {api, calls} = fixture(false);
  await assert.rejects(api.getAnonymousCookieConsents('2026-09-21', '2026-09-21'), /forbidden/);
  assert.deepEqual(calls, []);
});

test('calendar dates query the full Danish day and exclude the following midnight', async () => {
  const {api, calls} = fixture();
  const rows = await api.getAnonymousCookieConsents('2026-09-21', '2026-09-21');
  assert.deepEqual(rows.map(row => row.id), ['start', 'end']);
  assert.deepEqual(calls.slice(2), [
    ['last_seen', '>=', '2026-09-20T22:00:00.000Z'],
    ['last_seen', '<', '2026-09-21T22:00:00.000Z'],
    ['last_seen', 'desc'],
  ]);
  assert.equal(rows[0].first_seen.toISOString(), rows[0].last_seen.toISOString());
});

test('missing, invalid and reversed dates never fall back to an unbounded query', async () => {
  for (const [from, to] of [['2026-09-21', undefined], [undefined, '2026-09-21'], ['2026-02-30', '2026-03-01'], ['', ''], ['2026-09-22', '2026-09-21'], [new Date('invalid'), new Date()]]) {
    const {api, calls} = fixture();
    await assert.rejects(api.getAnonymousCookieConsents(from, to));
    assert.deepEqual(calls, []);
  }
});

test('Danish dates are independent of process timezone and include 23/25-hour DST days', () => {
  const {cookieConsentDateRange, cookieReportDay} = loadTs('src/lib/analytics/cookie-consent-dates.ts');
  assert.equal(cookieReportDay(new Date('2026-09-20T22:30:00Z')), '2026-09-21');
  for (const [day, start, end, hours] of [
    ['2026-03-29', '2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z', 23],
    ['2026-10-25', '2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z', 25],
  ]) {
    const range = cookieConsentDateRange(day, day);
    assert.equal(range.start.toISOString(), start);
    assert.equal(range.end.toISOString(), end);
    assert.equal((range.end - range.start) / 3600000, hours);
  }
});
