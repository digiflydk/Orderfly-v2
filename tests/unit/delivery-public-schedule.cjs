const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {managedFulfillmentSlots,resolveManagedFulfillmentTime,managedDeliverySelectionForSchedule}=loadTs('src/lib/delivery/public-schedule.ts');
const {fulfillmentSlots,resolveFulfillmentTime}=loadTs('src/lib/fulfillment-time.ts');
const now=new Date('2026-10-30T08:45:00Z'); // Friday 09:45 Copenhagen, kitchen opens 11:00.
const location={isActive:true,deliveryTypes:['pickup','delivery'],allowPreOrder:true,prep_time:20,delivery_time:20,openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'11:00',close:'22:00'}]))};
function schedule(days=[3]){return {enabled:true,paused:false,timezone:'Europe/Copenhagen',preparationMinutes:20,weeklyHours:Array.from({length:7},(_,day)=>({day,intervals:days.includes(day)?[{startMinute:660,endMinute:1260}]:[]})),exceptions:[]};}
test('Wednesday-only delivery removes Friday choices while preserving pickup and next valid delivery',()=>{
 const s=schedule();
 assert.ok(fulfillmentSlots(location,'delivery','2026-10-30',now).includes('2026-10-30T10:50:00.000Z'));
 assert.deepEqual(managedFulfillmentSlots(location,'delivery','2026-10-30',now,s),[]);
 for(const target of ['2026-10-30T10:50:00.000Z','2026-10-30T11:05:00.000Z'])assert.throws(()=>resolveManagedFulfillmentTime(location,'delivery',target,now,s));
 assert.equal(resolveManagedFulfillmentTime(location,'delivery','asap',now,s),'2026-11-04T10:40:00.000Z');
 assert.equal(managedDeliverySelectionForSchedule(location,'asap',now,s),'2026-11-04T10:40:00.000Z');
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
 assert.equal(managedDeliverySelectionForSchedule(location,'asap',now,s),'2026-10-30T10:40:00.000Z');
});
test('date exceptions replace weekly hours and exact closing is excluded',()=>{
 const s=schedule();s.exceptions=[{date:'2026-10-30',intervals:[{startMinute:720,endMinute:750}]}];
 const slots=managedFulfillmentSlots(location,'delivery','2026-10-30',now,s);
 assert.deepEqual(slots,['2026-10-30T11:00:00.000Z','2026-10-30T11:05:00.000Z','2026-10-30T11:10:00.000Z','2026-10-30T11:15:00.000Z','2026-10-30T11:20:00.000Z','2026-10-30T11:25:00.000Z']);
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
 assert.equal(managedFulfillmentSlots(location,'delivery','2026-10-30',now,s)[0],'2026-10-30T11:20:00.000Z');
 assert.throws(()=>resolveManagedFulfillmentTime(location,'delivery','2026-10-30T10:50:00.000Z',now,s));
});
