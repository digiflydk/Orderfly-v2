const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const {terminalDay,terminalDateTime,terminalDateHeading,isFutureTerminalDay,sortTerminalPreorders,historyFilterError} = loadTs('src/app/merchant/orders/terminal-filters.ts');

test('preorders use Copenhagen calendar boundaries, including DST changes', () => {
  assert.equal(terminalDay('2026-10-24T22:30:00Z'),'2026-10-25');
  assert.equal(terminalDay('2026-10-25T22:30:00Z'),'2026-10-25');
  assert.equal(terminalDay('2026-10-25T23:30:00Z'),'2026-10-26');
  assert.equal(terminalDay('2026-03-28T23:30:00Z'),'2026-03-29');
  assert.equal(terminalDay('2026-03-29T22:30:00Z'),'2026-03-30');
  assert.equal(isFutureTerminalDay({fulfillmentAt:'2026-10-25T22:59:00Z'},'2026-10-25T16:00:00Z'),false);
  assert.equal(isFutureTerminalDay({fulfillmentAt:'2026-10-25T23:00:00Z'},'2026-10-25T16:00:00Z'),true);
  // A future-day order becomes today's board order after Copenhagen midnight.
  assert.equal(isFutureTerminalDay({fulfillmentAt:'2026-10-26T17:00:00Z'},'2026-10-25T22:59:59Z'),true);
  assert.equal(isFutureTerminalDay({fulfillmentAt:'2026-10-26T17:00:00Z'},'2026-10-25T23:00:00Z'),false);
});
test('unknown timestamps are visibly unknown, never invented from browser locale', () => {
  for (const value of [null,undefined,'','not-a-date','2026-10-25','2026-10-25T18:00:00','2026-99-01T10:00:00Z','2026-02-30T10:00:00Z']) {
    assert.equal(terminalDay(value),null);
    assert.equal(terminalDateTime(value),'Tidspunkt mangler');
    assert.equal(terminalDateHeading(value),'Tidspunkt mangler');
    assert.equal(isFutureTerminalDay({fulfillmentAt:value},'2026-10-25T18:00:00Z'),false);
  }
});
test('sort by fulfillment instant, not order creation, with stable id and unknown last', () => {
  const orders=[{id:'unknown',fulfillmentAt:null},{id:'later',fulfillmentAt:'2026-10-27T18:00:00Z'},{id:'b',fulfillmentAt:'2026-10-26T17:00:00Z'},{id:'a',fulfillmentAt:'2026-10-26T17:00:00Z'}];
  assert.deepEqual(sortTerminalPreorders(orders).map(x=>x.id),['a','b','later','unknown']);
  assert.equal(orders[0].id,'unknown');
});
test('history dates reject invalid/reversed boundaries and allow open ranges', () => {
  const f={search:'',dateFrom:'',dateTo:''};
  assert.equal(historyFilterError(f),null);
  assert.equal(historyFilterError({...f,dateFrom:'2026-10-25'}),null);
  assert.equal(historyFilterError({...f,dateTo:'2026-10-25'}),null);
  assert.equal(historyFilterError({...f,dateFrom:'2026-10-25',dateTo:'2026-10-25'}),null);
  for (const bad of ['2026-02-30','2026-13-01','nonsense']) assert.match(historyFilterError({...f,dateFrom:bad}),/gyldig/);
  assert.match(historyFilterError({...f,dateFrom:'2026-10-26',dateTo:'2026-10-25'}),/Fra-dato/);
});
