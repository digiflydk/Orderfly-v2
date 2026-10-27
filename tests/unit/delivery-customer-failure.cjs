const {test}=require('node:test');const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {customerQuoteFailure}=loadTs('src/lib/delivery/quotes/customer-failure.ts');
const {managedDeliverySelection}=loadTs('src/lib/fulfillment-time.ts');
const location={isActive:true,deliveryTypes:['delivery'],allowPreOrder:true,prep_time:15,delivery_time:20,openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'11:00',close:'22:00'}]))};
test('closed kitchen next-slot display is sent as explicit time, open kitchen remains ASAP',()=>{
 assert.equal(managedDeliverySelection(location,'asap',new Date('2026-10-27T22:00:00Z')),'2026-10-28T10:35:00.000Z');
 assert.equal(managedDeliverySelection(location,'asap',new Date('2026-10-27T20:50:00Z')),'2026-10-28T10:35:00.000Z');
 assert.equal(managedDeliverySelection(location,'asap',new Date('2026-10-27T12:00:00Z')),'asap');
 assert.equal(managedDeliverySelection(location,'2026-10-28T11:00:00.000Z',new Date('2026-10-27T22:00:00Z')),'2026-10-28T11:00:00.000Z');
 assert.throws(()=>managedDeliverySelection({...location,allowPreOrder:false},'asap',new Date('2026-10-27T22:00:00Z')));
});
test('failure mapping only exposes allowlisted codes, never upstream error text',()=>{
 for(const reason of ['__proto__','constructor','toString'])assert.equal(customerQuoteFailure(reason).code,'delivery_unavailable');
 for(const [reason,code] of [['delivery_kitchen_closed','closed'],['ambiguous_address','invalid_address'],['routing_unavailable','route_unavailable'],['unsupported_schedule','unsupported_schedule'],['caps_conflict','caps_conflict'],['API key SECRET response private_price=999','delivery_unavailable'],[new Error('private'), 'delivery_unavailable']]){
 const result=customerQuoteFailure(reason);assert.equal(result.code,code);assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/SECRET|private/);
 }
});
