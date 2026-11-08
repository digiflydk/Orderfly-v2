const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { mobileReadyLane, mobileKdsCounts, mobileKdsOrders } = loadTs('src/lib/orders/mobile-kds.ts');

const row = (id, status, fields = {}) => ({
  id, status, deliveryType: 'Pickup',
  createdAt: '2026-11-08T12:00:00Z', fulfillmentAt: '2026-11-08T12:30:00Z',
  ...fields,
});

test('mobile kitchen counters partition only existing authorized status rows', () => {
  const rows = [
    row('new', 'Received'), row('cooking', 'In Progress'),
    row('ready-pickup', 'Ready'),
    row('courier-booked', 'Ready', {deliveryType:'Delivery', managedDeliveryTracking:{deliveryStatus:'booked'}}),
    row('courier-collected', 'Ready', {deliveryType:'Delivery', managedDeliveryTracking:{deliveryStatus:'picked_up'}}),
    row('complete', 'Completed'), row('cancelled', 'Canceled'),
  ];
  assert.deepEqual(mobileKdsCounts(rows), {received:1, progress:1, ready:3, waiting:2, delivery:1});
  assert.deepEqual(mobileKdsOrders(rows,'received','waiting').map(x=>x.id),['new']);
  assert.deepEqual(mobileKdsOrders(rows,'progress','waiting').map(x=>x.id),['cooking']);
  assert.deepEqual(mobileKdsOrders(rows,'ready','waiting').map(x=>x.id),['courier-booked','ready-pickup']);
  assert.deepEqual(mobileKdsOrders(rows,'ready','delivery').map(x=>x.id),['courier-collected']);
});

test('a delivery is not labelled out for delivery until the native courier pickup event', () => {
  for (const deliveryStatus of [undefined,null,'booked','courier_assigned','courier_to_pickup','cancelled','failed']) {
    assert.equal(mobileReadyLane(row('delivery','Ready',{deliveryType:'Delivery',
      managedDeliveryTracking:{deliveryStatus}})),'waiting');
  }
  assert.equal(mobileReadyLane(row('delivery','Ready',{deliveryType:'Delivery',
    managedDeliveryTracking:{deliveryStatus:'picked_up'}})),'delivery');
  assert.equal(mobileReadyLane(row('pickup','Ready',{deliveryType:'Pickup',
    managedDeliveryTracking:{deliveryStatus:'picked_up'}})),'waiting');
});

test('mobile ordering is stable and non-mutating', () => {
  const rows=[row('later','Received',{fulfillmentAt:'2026-11-08T13:30:00Z'}),
    row('b','Received'),row('a','Received'),row('ready','Ready')];
  assert.deepEqual(mobileKdsOrders(rows,'received','waiting').map(x=>x.id),['a','b','later']);
  assert.deepEqual(rows.map(x=>x.id),['later','b','a','ready']);
});
