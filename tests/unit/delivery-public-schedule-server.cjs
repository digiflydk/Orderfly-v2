const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture(options={}){
 const reads=[],settingsReads=[];
 const settings={scheduleMode:'restaurant',pickupOpeningOffsetMinutes:20,pickupClosingOffsetMinutes:20,enabled:true,paused:false,timezone:'Europe/Copenhagen',weeklyHours:Array.from({length:7},(_,day)=>({day,intervals:day===3?[{startMinute:660,endMinute:1260}]:[]})),exceptions:[],preparationMinutes:20,providerId:'wolt',pricingRules:{private:'not public'},secretRef:'not public'};
 const rows=new Map([['locations/l',{brandId:'b'}],['deliveryAdoptions/b:l',{version:1,brandId:'b',locationId:'l',mode:'managed'}]]);
 const db={collection:name=>({doc:id=>({path:`${name}/${id}`})}),runTransaction:async fn=>{if(options.failure)throw Error('database unavailable');return fn({get:async ref=>{reads.push(ref.path);return {exists:rows.has(ref.path),data:()=>rows.get(ref.path)};}});}};
 const api=loadTs('src/lib/delivery/public-schedule-server.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'./quotes/adoption':{deliveryAdoptionKey:scope=>`${scope.brandId}:${scope.locationId}`},'./settings/server':{loadDeliverySettingsInTransaction:async(tx,brandId,locationId)=>{settingsReads.push({brandId,locationId});return {result:{settings}};}}});
 return {api,rows,reads,settingsReads,settings};
}
test('public schedule resolves scoped managed settings and exposes only availability fields',async()=>{
 const f=fixture(),result=await f.api.readPublicManagedDeliverySchedule({brandId:'b',locationId:'l'});
 assert.deepEqual(Object.keys(result).sort(),['enabled','exceptions','paused','pickupClosingOffsetMinutes','pickupOpeningOffsetMinutes','preparationMinutes','scheduleMode','timezone','weeklyHours']);
 assert.deepEqual(result.weeklyHours,f.settings.weeklyHours);
 assert.deepEqual(f.reads,['locations/l','deliveryAdoptions/b:l']);
 assert.deepEqual(f.settingsReads,[{brandId:'b',locationId:'l'}]);
 assert.doesNotMatch(JSON.stringify(result),/secretRef|not public|pricingRules|providerId/);
});
test('verified legacy location alone returns null without loading managed settings',async()=>{
 const f=fixture();f.rows.delete('deliveryAdoptions/b:l');
 assert.equal(await f.api.readPublicManagedDeliverySchedule({brandId:'b',locationId:'l'}),null);
 assert.deepEqual(f.settingsReads,[]);
});
test('foreign location, malformed adoption, missing location and read errors fail closed',async()=>{
 const cases=[f=>f.rows.set('locations/l',{brandId:'other'}),f=>f.rows.delete('locations/l'),f=>f.rows.set('deliveryAdoptions/b:l',{version:1,brandId:'other',locationId:'l',mode:'managed'}),f=>f.rows.set('deliveryAdoptions/b:l',{version:2,brandId:'b',locationId:'l',mode:'managed'})];
 for(const mutate of cases){const f=fixture();mutate(f);const result=await f.api.readPublicManagedDeliverySchedule({brandId:'b',locationId:'l'});assert.equal(result.enabled,false);assert.deepEqual(f.settingsReads,[]);}
 const f=fixture({failure:true});assert.equal((await f.api.readPublicManagedDeliverySchedule({brandId:'b',locationId:'l'})).enabled,false);
 const invalid=fixture();assert.equal((await invalid.api.readPublicManagedDeliverySchedule({brandId:'b',locationId:'../l'})).enabled,false);assert.deepEqual(invalid.reads,[]);
});
