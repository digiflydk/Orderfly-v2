const {test}=require('node:test');const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {planVerifiedDeliveryEvent:plan}=loadTs('src/lib/delivery/events/state.ts');
const state=(extra={})=>({brandId:'a',locationId:'a1',orderId:'o1',provider:'test',providerDeliveryId:'p1',status:'booked',occurredAt:100,sequence:1,nativeStatus:'created',...extra});
const event=(extra={})=>({...state(),eventId:'e1',receivedAt:120,occurredAt:110,sequence:2,status:'picked_up',nativeStatus:'collected',...extra});
test('permits skipped supported states without changing kitchen/payment data',()=>{
 const result=plan(state(),event());assert.equal(result.action,'apply');assert.equal(result.snapshot.status,'picked_up');
 assert.equal('receivedAt' in result.snapshot,false);assert.equal('paymentStatus' in result.snapshot,false);
});
test('stale updates ignored; terminal conflicts and reassignment request reconciliation',()=>{
 assert.equal(plan(state({sequence:5}),event()).action,'ignore');
 assert.equal(plan(state({status:'delivered'}),event({status:'cancelled'})).action,'reconcile');
 assert.equal(plan(state({status:'courier_to_pickup'}),event({status:'courier_assigned'})).action,'reconcile');
 assert.equal(plan(state({status:'picked_up'}),event({status:'cancelled'})).action,'reconcile');
});
test('equal sequence conflicts, missing sequence and equal-time unsequenced changes reconcile',()=>{
 assert.equal(plan(state(),event({sequence:1})).action,'reconcile');
 assert.equal(plan(state(),event({sequence:null})).action,'reconcile');
 assert.equal(plan(state({sequence:null}),event({sequence:null,occurredAt:100})).action,'reconcile');
 assert.equal(plan(state(),event({sequence:1,status:'booked',nativeStatus:'created'})).action,'ignore');
});
test('binding mismatch and malformed event rejected before projection',()=>{
 for(const key of ['brandId','locationId','orderId','provider','providerDeliveryId'])assert.throws(()=>plan(state(),event({[key]:'foreign'})),/scope/);
 assert.throws(()=>plan(state(),event({sequence:-1})));
});
