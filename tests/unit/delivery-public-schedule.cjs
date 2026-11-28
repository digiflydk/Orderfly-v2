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
test('Wolt lead: scheduled slots start at 60 min plus margin, ASAP stays courier-now, explicit early times are refused',()=>{
 // Rehearsal regression: Friday 11:43 Copenhagen offered 12:35, 12:40 … which Wolt refuses (< 60 min ahead).
 const at=new Date('2026-10-30T10:43:00Z'),s={...schedule([5]),scheduledLead:{minMinutes:60,maxMinutes:10080}};
 const slots=managedFulfillmentSlots(location,'delivery','2026-10-30',at,s);
 assert.equal(slots[0],'2026-10-30T12:00:00.000Z'); // 13:00 local: first slot >= 11:43 + 60 + 15
 assert.ok(slots.every(slot=>Date.parse(slot)-at.getTime()>=75*60000));
 assert.ok(managedFulfillmentSlots(location,'delivery','2026-10-30',at,schedule([5])).includes('2026-10-30T11:35:00.000Z'),'without a lead the early slot exists');
 assert.equal(managedDeliverySelectionForSchedule(location,'asap',at,s),'asap');
 assert.equal(resolveManagedFulfillmentTime(location,'delivery','asap',at,s),resolveManagedFulfillmentTime(location,'delivery','asap',at,schedule([5])));
 for(const early of ['2026-10-30T11:35:00.000Z','2026-10-30T11:45:00.000Z'])assert.throws(()=>resolveManagedFulfillmentTime(location,'delivery',early,at,s),/unsupported_schedule/);
 // An offered slot stays acceptable for eight minutes (accept margin 7 min, above the 5-min quote freshness), then is refused as too early.
 assert.equal(resolveManagedFulfillmentTime(location,'delivery','2026-10-30T12:00:00.000Z',new Date('2026-10-30T10:53:00Z'),s),'2026-10-30T12:00:00.000Z');
 assert.throws(()=>resolveManagedFulfillmentTime(location,'delivery','2026-10-30T12:00:00.000Z',new Date('2026-10-30T10:54:00Z'),s),/unsupported_schedule/);
 // Server callers pass full settings: the Wolt provider id alone applies the limit.
 assert.throws(()=>resolveManagedFulfillmentTime(location,'delivery','2026-10-30T11:35:00.000Z',at,{...schedule([5]),providerId:'wolt'}),/unsupported_schedule/);
 assert.equal(resolveManagedFulfillmentTime(location,'delivery','2026-10-30T11:35:00.000Z',at,{...schedule([5]),providerId:'test'}),'2026-10-30T11:35:00.000Z');
 // Unknown slots keep the generic unavailable-time error.
 assert.throws(()=>resolveManagedFulfillmentTime(location,'delivery','2026-10-30T11:37:00.000Z',at,s),err=>!/unsupported_schedule/.test(err.message));
});
test('Wolt lead: closed-kitchen ASAP becomes the first slot that satisfies the lead, and the 7-day limit trims the last day',()=>{
 const s={...schedule([5]),scheduledLead:{minMinutes:60,maxMinutes:10080}};
 // Friday 10:50 Copenhagen, kitchen opens 11:00: raw first arrival 11:50 is exactly 60 min ahead, so a later one is used.
 const closed=new Date('2026-10-30T09:50:00Z');
 assert.equal(managedDeliverySelectionForSchedule(location,'asap',closed,schedule([5])),'2026-10-30T10:50:00.000Z');
 assert.equal(managedDeliverySelectionForSchedule(location,'asap',closed,s),'2026-10-30T11:05:00.000Z');
 // Friday 16:00 Copenhagen: next Friday's arrivals after 15:45 local (7 days minus margin) are not offered.
 const late=new Date('2026-10-30T15:00:00Z');
 const nextFriday=managedFulfillmentSlots(location,'delivery','2026-11-06',late,s);
 assert.equal(nextFriday[0],'2026-11-06T10:50:00.000Z');
 assert.equal(nextFriday.at(-1),'2026-11-06T14:45:00.000Z');
 assert.ok(managedFulfillmentSlots(location,'delivery','2026-11-06',late,schedule([5])).includes('2026-11-06T15:05:00.000Z'));
 assert.throws(()=>resolveManagedFulfillmentTime(location,'delivery','2026-11-06T15:05:00.000Z',late,s),/unsupported_schedule/);
});
