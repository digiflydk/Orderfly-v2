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
test('a request made before the modal host first subscribes (menu effect runs first) is delivered once',()=>{
  const state=loadTs('src/lib/delivery-modal-state.ts');
  const early={brandSlug:'esmeralda',locationSlug:'amager'};
  state.openDeliveryModal(early);
  const received=[];const stop=state.subscribeDeliveryModal(value=>received.push(value));
  assert.deepEqual(received,[early]);
  // Delivered once: a later host does not see it again.
  stop();const again=[];state.subscribeDeliveryModal(value=>again.push(value));assert.deepEqual(again,[]);
});
