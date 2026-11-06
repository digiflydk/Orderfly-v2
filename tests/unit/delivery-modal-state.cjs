const {test} = require('node:test');
const assert = require('node:assert/strict');
const {loadTs} = require('../helpers/load-ts.cjs');
test('delivery bridge preserves brand/location and does not replay stale requests after navigation', () => {
  const state=loadTs('src/lib/delivery-modal-state.ts');
  const first={brandSlug:'a',locationSlug:'old'}, latest={brandSlug:'b',locationSlug:'new'};
  const received=[];const stop=state.subscribeDeliveryModal(value=>received.push(value));
  state.openDeliveryModal(first);state.openDeliveryModal(latest);
  assert.deepEqual(received,[first,latest]);
  stop();state.openDeliveryModal(first);
  const next=[];const stopNext=state.subscribeDeliveryModal(value=>next.push(value));
  assert.deepEqual(next,[]);
  state.openDeliveryModal(latest);assert.deepEqual(next,[latest]);stopNext();
});
