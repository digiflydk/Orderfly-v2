const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {managedFulfillmentSlots,resolveManagedFulfillmentTime,managedDeliverySelectionForSchedule}=loadTs('src/lib/delivery/public-schedule.ts');
const {fulfillmentSlots,resolveFulfillmentTime}=loadTs('src/lib/fulfillment-time.ts');
const now=new Date('2026-10-30T08:45:00Z'); // Friday 09:45 Copenhagen, kitchen opens 11:00.
const location={isActive:true,deliveryTypes:['pickup','delivery'],allowPreOrder:true,prep_time:20,delivery_time:20,openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'11:00',close:'22:00'}]))};
function schedule(days=[3]){return {scheduleMode:'manual',pickupOpeningOffsetMinutes:20,pickupClosingOffsetMinutes:20,enabled:true,paused:false,timezone:'Europe/Copenhagen',preparationMinutes:20,weeklyHours:Array.from({length:7},(_,day)=>({day,intervals:days.includes(day)?[{startMinute:660,endMinute:1260}]:[]})),exceptions:[]};}
test('Wednesday-only delivery removes Friday choices while preserving pickup and next valid delivery',()=>{
 const s=schedule();
 assert.ok(fulfillmentSlots(location,'delivery','2026-10-30',now).includes('2026-10-30T10:50:00.000Z'));
 assert.deepEqual(managedFulfillmentSlots(location,'delivery','2026-10-30',now,s),[]);
 for(const target of ['2026-10-30T10:50:00.000Z','2026-10-30T11:05:00.000Z'])assert.throws(()=>resolveManagedFulfillmentTime(location,'delivery',target,now,s));
 assert.equal(resolveManagedFulfillmentTime(location,'delivery','asap',now,s),'2026-11-04T10:50:00.000Z');
 assert.equal(managedDeliverySelectionForSchedule(location,'asap',now,s),'2026-11-04T10:50:00.000Z');
 assert.deepEqual(managedFulfillmentSlots(location,'pickup','2026-10-30',now,s),fulfillmentSlots(location,'pickup','2026-10-30',now));
 assert.equal(resolveManagedFulfillmentTime(location,'pickup','asap',now,s),resolveFulfillmentTime(location,'pickup','asap',now));
});
test('valid same-day 11:50 and 12:05 deliveries remain selectable before kitchen opens',()=>{
 const s=schedule([5]);
 for(const target of ['2026-10-30T10:50:00.000Z','2026-10-30T11:05:00.000Z']){
  assert.ok(managedFulfillmentSlots(location,'delivery','2026-10-30',now,s).includes(target));
  assert.equal(resolveManagedFulfillmentTime(location,'delivery',target,now,s),target);
  assert.equal(managedDeliverySelectionForSchedule(location,target,now,s),target);
 }
 assert.equal(managedDeliverySelectionForSchedule(location,'asap',now,s),'2026-10-30T10:50:00.000Z');
});
test('date exceptions replace weekly hours and exact closing is excluded',()=>{
 const s=schedule();s.exceptions=[{date:'2026-10-30',intervals:[{startMinute:720,endMinute:750}]}];
 const slots=managedFulfillmentSlots(location,'delivery','2026-10-30',now,s);
 assert.deepEqual(slots,['2026-10-30T11:30:00.000Z','2026-10-30T11:35:00.000Z','2026-10-30T11:40:00.000Z','2026-10-30T11:45:00.000Z','2026-10-30T11:50:00.000Z','2026-10-30T11:55:00.000Z']);
 s.exceptions=[{date:'2026-10-30',intervals:[]}];s.weeklyHours=schedule([5]).weeklyHours;
 assert.deepEqual(managedFulfillmentSlots(location,'delivery','2026-10-30',now,s),[]);
});
test('paused, disabled and unavailable preorder remain closed without affecting legacy pickup',()=>{
 for(const patch of [{paused:true},{enabled:false}]){
  const s={...schedule([5]),...patch};
  assert.deepEqual(managedFulfillmentSlots(location,'delivery','2026-10-30',now,s),[]);
  assert.throws(()=>resolveManagedFulfillmentTime(location,'delivery','asap',now,s));
  assert.deepEqual(managedFulfillmentSlots(location,'pickup','2026-10-30',now,s),fulfillmentSlots(location,'pickup','2026-10-30',now));
 }
 assert.throws(()=>resolveManagedFulfillmentTime({...location,allowPreOrder:false},'delivery','asap',now,schedule()));
 for(const s of [null,undefined])assert.deepEqual(managedFulfillmentSlots(location,'delivery','2026-10-30',now,s),fulfillmentSlots(location,'delivery','2026-10-30',now));
});
test('configured preparation floor delays selectable slots and invalidates too-early selections',()=>{
 const s={...schedule([5]),preparationMinutes:60};
 assert.equal(managedFulfillmentSlots(location,'delivery','2026-10-30',now,s)[0],'2026-10-30T11:30:00.000Z');
 assert.throws(()=>resolveManagedFulfillmentTime(location,'delivery','2026-10-30T10:50:00.000Z',now,s));
});

 test('managed default is location preparation plus thirty minutes transport, without changing pickup',()=>{
 const at=new Date('2026-10-30T11:40:00Z'),s=schedule([5]);
 assert.equal(resolveManagedFulfillmentTime(location,'delivery','asap',at,s),'2026-10-30T12:30:00.000Z');
 assert.equal(resolveManagedFulfillmentTime({...location,prep_time:30},'delivery','asap',at,s),'2026-10-30T12:40:00.000Z');
 assert.equal(resolveManagedFulfillmentTime(location,'pickup','asap',at,s),'2026-10-30T12:00:00.000Z');
 assert.equal(managedDeliverySelectionForSchedule(location,'asap',at,s),'asap');
 });

test('inherited pickup window yields 11:50–22:10 arrivals and excludes the following slot',()=>{
 const s={...schedule([5]),scheduleMode:'restaurant',weeklyHours:Array.from({length:7},(_,day)=>({day,intervals:[{startMinute:680,endMinute:1301}]}))};
 const slots=managedFulfillmentSlots(location,'delivery','2026-10-30',now,s);
 assert.equal(slots[0],'2026-10-30T10:50:00.000Z');
 assert.equal(slots.at(-1),'2026-10-30T21:10:00.000Z');
 assert.equal(resolveManagedFulfillmentTime(location,'delivery','2026-10-30T21:10:00.000Z',now,s),'2026-10-30T21:10:00.000Z');
 assert.throws(()=>resolveManagedFulfillmentTime(location,'delivery','2026-10-30T21:15:00.000Z',now,s));
 assert.equal(managedDeliverySelectionForSchedule(location,'asap',new Date('2026-10-30T20:20:00Z'),s),'asap');
 assert.notEqual(managedDeliverySelectionForSchedule(location,'asap',new Date('2026-10-30T20:21:00Z'),s),'asap');
 assert.equal(managedFulfillmentSlots({...location,deliveryTypes:['delivery']},'delivery','2026-10-30',now,s)[0],slots[0]);
 assert.deepEqual(managedFulfillmentSlots({...location,deliveryTypes:['pickup']},'delivery','2026-10-30',now,s),[]);
});
test('restaurant mode derives raw hours, offsets and exceptions without reopening paused delivery',()=>{
 const s={...schedule([]),scheduleMode:'restaurant',pickupOpeningOffsetMinutes:40,pickupClosingOffsetMinutes:35};
 const slots=managedFulfillmentSlots(location,'delivery','2026-10-30',now,s);
 assert.equal(slots[0],'2026-10-30T11:10:00.000Z');
 assert.equal(slots.at(-1),'2026-10-30T20:55:00.000Z');
 for(const patch of [{enabled:false},{paused:true},{exceptions:[{date:'2026-10-30',intervals:[]}]}])assert.deepEqual(managedFulfillmentSlots(location,'delivery','2026-10-30',now,{...s,...patch}),[]);
});
test('overnight inherited pickup produces next-day customer arrival and validates explicit selection',()=>{
 const overnight={...location,openingHours:{...location.openingHours,friday:{isOpen:true,open:'18:00',close:'02:00'}}};
 const s={...schedule([]),scheduleMode:'restaurant'};
 const slots=managedFulfillmentSlots(overnight,'delivery','2026-10-30',now,s);
 assert.equal(slots[0],'2026-10-30T17:50:00.000Z');
 assert.equal(slots.at(-1),'2026-10-31T01:10:00.000Z');
 assert.equal(resolveManagedFulfillmentTime(overnight,'delivery',slots.at(-1),now,s),slots.at(-1));
});
