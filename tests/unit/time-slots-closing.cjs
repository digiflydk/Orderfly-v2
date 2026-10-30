const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {calculateTimeSlots}=loadTs('src/lib/time-slots.ts');
const {fulfillmentSlots,resolveFulfillmentTime}=loadTs('src/lib/fulfillment-time.ts');
const location={isActive:true,deliveryTypes:['pickup','delivery'],allowPreOrder:true,prep_time:20,delivery_time:30,openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'11:00',close:'22:00'}]))};

test('Friday 20:25 keeps delivery today at 21:15 and fulfillment through 22:00',()=>{
 const now=new Date('2026-10-30T19:25:00Z');
 const slots=calculateTimeSlots(location,undefined,now);
 assert.equal(slots.delivery_times[0],'21:15');
 assert.equal(slots.delivery_times.at(-1),'22:00');
 assert.equal(slots.pickup_times[0],'20:45');
 assert.equal(slots.pickup_times.at(-1),'22:00');
 assert.equal(resolveFulfillmentTime(location,'delivery','asap',now),'2026-10-30T20:15:00.000Z');
 assert.equal(resolveFulfillmentTime(location,'delivery','2026-10-30T21:00:00.000Z',now),'2026-10-30T21:00:00.000Z');
 assert.throws(()=>resolveFulfillmentTime(location,'delivery','2026-10-30T21:05:00.000Z',now));
});
test('lead time is still required and a rounded slot past closing is rejected',()=>{
 const exact=calculateTimeSlots(location,undefined,new Date('2026-10-30T20:10:00Z'));
 assert.deepEqual(exact.delivery_times,['22:00']);
 const late=calculateTimeSlots({...location,allowPreOrder:false},undefined,new Date('2026-10-30T20:10:01Z'));
 assert.deepEqual(late.delivery_times,[]);assert.equal(late.asap_delivery,'');
 assert.deepEqual(calculateTimeSlots(location,undefined,new Date('2026-10-30T21:00:00Z')).pickup_times,[]);
});
test('short future opening accepts one full lead time instead of requiring two',()=>{
 const short={...location,openingHours:{friday:{isOpen:true,open:'11:00',close:'11:50'}}};
 const now=new Date('2026-10-29T19:00:00Z');
 assert.equal(calculateTimeSlots(short,undefined,now).asap_delivery,'Tomorrow - 11:50');
 assert.deepEqual(calculateTimeSlots(short,'2026-10-30T12:00:00Z',now).delivery_times,['11:50']);
 assert.equal(resolveFulfillmentTime(short,'delivery','asap',now),'2026-10-30T10:50:00.000Z');
});
test('overnight closing stays on the next calendar day and never extends beyond closing',()=>{
 const overnight={...location,openingHours:{friday:{isOpen:true,open:'18:00',close:'01:00'}}};
 const now=new Date('2026-10-30T22:50:00Z');
 const slots=fulfillmentSlots(overnight,'delivery','2026-10-30',now);
 assert.equal(slots[0],'2026-10-30T23:40:00.000Z');
 assert.equal(slots.at(-1),'2026-10-31T00:00:00.000Z');
 assert.equal(resolveFulfillmentTime(overnight,'delivery',slots.at(-1),now),slots.at(-1));
});
test('spring-forward skips nonexistent wall times and keeps the real preparation minimum',()=>{
 const dst={...location,openingHours:{sunday:{isOpen:true,open:'00:00',close:'04:00'}}};
 const now=new Date('2026-03-29T00:30:00Z');
 const wall=calculateTimeSlots(dst,'2026-03-29T12:00:00Z',now).delivery_times;
 assert.ok(wall.length);assert.ok(wall.every(value=>!value.startsWith('02:')));
 const slots=fulfillmentSlots(dst,'delivery','2026-03-29',now);
 assert.equal(slots[0],'2026-03-29T01:20:00.000Z');
 assert.equal(slots.at(-1),'2026-03-29T02:00:00.000Z');
 assert.ok(slots.every(value=>Date.parse(value)>=now.getTime()+50*60000));
});
test('autumn repeated hour stays unique and never bypasses real lead time',()=>{
 const dst={...location,openingHours:{sunday:{isOpen:true,open:'00:00',close:'04:00'}}};
 const now=new Date('2026-10-25T00:30:00Z');
 const slots=fulfillmentSlots(dst,'delivery','2026-10-25',now);
 assert.ok(slots.length);assert.equal(new Set(slots).size,slots.length);
 assert.ok(slots.every(value=>Date.parse(value)>=now.getTime()+50*60000));
 assert.equal(slots.at(-1),'2026-10-25T03:00:00.000Z');
});
