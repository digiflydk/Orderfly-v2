const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {parseKdsSettings,kitchenReleaseAt,isKitchenPreorder,kitchenIsOpen}=loadTs('src/lib/orders/kds-settings.ts');
test('preorders enter the kitchen exactly at the configured threshold, without hiding cooking orders',()=>{
 const settings=parseKdsSettings({preorderMinutes:30});const row={status:'Received',fulfillmentAt:'2026-11-08T17:00:00Z'};
 const due=Date.parse('2026-11-08T16:30:00Z');assert.equal(kitchenReleaseAt(row,settings),due);assert.equal(isKitchenPreorder(row,due-1,settings),true);assert.equal(isKitchenPreorder(row,due,settings),false);assert.equal(isKitchenPreorder({...row,status:'In Progress'},due-1,settings),false);
});
test('Copenhagen closing times include overnight shifts and fail open when configuration is missing',()=>{
 const hours={saturday:{isOpen:true,open:'18:00',close:'02:00'},sunday:{isOpen:false,open:'10:00',close:'22:00'}};
 assert.equal(kitchenIsOpen(hours,Date.parse('2026-11-07T23:30:00Z')),true);
 assert.equal(kitchenIsOpen(hours,Date.parse('2026-11-08T01:00:00Z')),false);
 assert.equal(kitchenIsOpen(undefined,Date.now()),true);
});
