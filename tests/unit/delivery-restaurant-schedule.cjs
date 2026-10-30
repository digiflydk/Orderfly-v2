const {test}=require('node:test');const assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
const {defaultDeliverySettings,deliverySettingsSchema}=loadTs('src/lib/delivery/settings/schema.ts');
const {resolveRestaurantDeliverySchedule}=loadTs('src/lib/delivery/settings/restaurant-schedule.ts');
const {deliveryScheduleAt}=loadTs('src/lib/delivery/settings/schedule.ts');
const hours={friday:{isOpen:true,open:'11:00',close:'22:00'}};
const base=()=>({...defaultDeliverySettings(),enabled:true});
test('missing mode inherits actual location hours over sparse old weekly rows with inclusive pickup endpoints',()=>{
 const input=base();delete input.scheduleMode;delete input.pickupOpeningOffsetMinutes;delete input.pickupClosingOffsetMinutes;
 input.weeklyHours[3].intervals=[{startMinute:660,endMinute:1260}];
 const settings=resolveRestaurantDeliverySchedule(input,hours);
 assert.equal(settings.scheduleMode,'restaurant');
 assert.deepEqual(settings.weeklyHours[5].intervals,[{startMinute:680,endMinute:1301}]);
 assert.deepEqual(settings.weeklyHours[3].intervals,[]);
 for(const [time,open] of [['10:19',false],['10:20',true],['20:40',true],['20:41',false]])assert.equal(deliveryScheduleAt(settings,new Date(`2026-10-30T${time}:00Z`)).open,open);
});
test('explicit manual mode, disabled, paused and date exceptions remain authoritative',()=>{
 const settings=base();settings.scheduleMode='manual';settings.weeklyHours[5].intervals=[{startMinute:720,endMinute:780}];
 assert.deepEqual(resolveRestaurantDeliverySchedule(settings,hours).weeklyHours,settings.weeklyHours);
 for(const patch of [{enabled:false},{paused:true},{exceptions:[{date:'2026-10-30',intervals:[]}]}])assert.equal(deliveryScheduleAt(resolveRestaurantDeliverySchedule({...base(),...patch},hours),new Date('2026-10-30T12:00:00Z')).open,false);
});
test('offsets validate, short openings stay closed and overnight spill belongs to correct next day',()=>{
 assert.equal(deliverySettingsSchema.safeParse({...base(),pickupClosingOffsetMinutes:-1}).success,false);
 assert.deepEqual(resolveRestaurantDeliverySchedule(base(),{friday:{isOpen:true,open:'11:00',close:'11:30'}}).weeklyHours[5].intervals,[]);
 const s=resolveRestaurantDeliverySchedule(base(),{friday:{isOpen:true,open:'18:00',close:'01:00'}});
 assert.deepEqual(s.weeklyHours[5].intervals,[{startMinute:1100,endMinute:1440}]);
 assert.deepEqual(s.weeklyHours[6].intervals,[{startMinute:0,endMinute:41}]);
 assert.equal(deliveryScheduleAt(s,new Date('2026-10-30T23:40:00Z')).open,true);
 assert.equal(deliveryScheduleAt(s,new Date('2026-10-30T23:41:00Z')).open,false);
});
test('derived Copenhagen pickup hours use correct offsets on both sides of DST changes',()=>{
 const s=resolveRestaurantDeliverySchedule(base(),{sunday:{isOpen:true,open:'01:00',close:'04:00'}});
 for(const time of ['2026-03-29T00:20:00Z','2026-03-29T01:40:00Z','2026-10-25T00:30:00Z','2026-10-25T01:30:00Z','2026-10-25T02:40:00Z'])assert.equal(deliveryScheduleAt(s,new Date(time)).open,true,time);
 for(const time of ['2026-03-29T01:41:00Z','2026-10-25T02:41:00Z'])assert.equal(deliveryScheduleAt(s,new Date(time)).open,false,time);
});
