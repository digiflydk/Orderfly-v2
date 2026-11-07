const {test}=require('node:test'),assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
const {kitchenCountdown,kitchenDeadline,kitchenOverdue,kitchenDay}=loadTs('src/lib/orders/kitchen-clock.ts');
test('Copenhagen service dates handle midnight and DST; countdown keeps its minus sign',()=>{
 assert.equal(kitchenDay('2026-11-07T23:30:00Z'),'2026-11-08');assert.equal(kitchenDay('2026-06-01T22:30:00Z'),'2026-06-02');
 assert.equal(kitchenCountdown('2026-11-07T15:00:00Z',Date.parse('2026-11-07T14:59:01Z')),'0:59');assert.equal(kitchenCountdown('2026-11-07T15:00:00Z',Date.parse('2026-11-07T15:05:01Z')),'−5:01');assert.equal(kitchenCountdown(null,Date.now()),'Tid ikke angivet');
});
test('overdue alarm stops when marked ready and resets to changed kitchen time',()=>{
 const order={status:'In Progress',fulfillmentAt:'2026-11-07T15:00:00Z'};const now=Date.parse('2026-11-07T15:05:00Z');
 assert.equal(kitchenOverdue(order,now,5),true);assert.equal(kitchenOverdue(order,now,6),false);assert.equal(kitchenOverdue({...order,status:'Ready'},now,5),false);assert.equal(kitchenOverdue({...order,kitchenReadyAt:'2026-11-07T15:15:00Z'},now,5),false);
 assert.equal(kitchenDeadline({...order,managedDelivery:true,managedDeliveryTracking:{pickupInterval:{earliest:'2026-11-07T14:50:00Z'}}}),'2026-11-07T14:50:00.000Z');
});
