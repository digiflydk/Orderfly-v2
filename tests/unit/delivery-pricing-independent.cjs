const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {calculateDeliveryPrice:calc}=loadTs('src/lib/delivery/pricing/calculate.ts');
function f(){return {rules:{version:'v1',currency:'DKK',taxBasis:'inclusive',maxDistanceMeters:10000,minimumMinor:10000,maximumCustomerFeeMinor:10000,maximumSubsidyMinor:10000,tariff:{kind:'kilometer',baseMinor:1000,includedMeters:1000,perKmMinor:1500}},route:{meters:1000,method:'route',source:'synthetic',profile:'car',calculatedAt:'2026-10-25T10:00:00Z'},itemSubtotalAfterDiscountMinor:10000,providerCost:{amountMinor:4000,currency:'DKK',taxBasis:'inclusive'}}}
test('independent kilometer arithmetic at included and fractional distances',()=>{
 for(const [meters,expected] of [[0,1000],[999,1000],[1000,1000],[1001,1002],[1002,1003],[1500,1750],[2000,2500]]){const x=f();x.route.meters=meters;assert.equal(calc(x).snapshot.customerFee.amountMinor,expected);}
});
test('independent cap/minimum comparisons accept equality and reject one minor unit beyond',()=>{
 const x=f();x.rules.maximumSubsidyMinor=3000;x.rules.maximumCustomerFeeMinor=1000;assert.equal(calc(x).ok,true);
 x.providerCost.amountMinor=4001;assert.equal(calc(x).reason,'caps_conflict');
 x.providerCost.amountMinor=4000;x.itemSubtotalAfterDiscountMinor=9999;assert.equal(calc(x).reason,'minimum_not_met');
});
test('independent extreme safe integers never produce unsafe fee',()=>{
 const x=f();x.rules.maxDistanceMeters=Number.MAX_SAFE_INTEGER;x.route.meters=Number.MAX_SAFE_INTEGER;x.rules.tariff.perKmMinor=Number.MAX_SAFE_INTEGER;
 assert.equal(calc(x).reason,'invalid_rules');
});
test('independent band boundary belongs to next band, final maximum included',()=>{
 const x=f();x.rules.tariff={kind:'bands',bands:[{fromMeters:0,toMeters:1000,feeMinor:500,minimumMinor:0},{fromMeters:1000,toMeters:10000,feeMinor:600,minimumMinor:10000}]};
 for(const [meters,expected] of [[0,500],[999,500],[1000,600],[9999,600],[10000,600]]){x.route.meters=meters;assert.equal(calc(x).snapshot.customerFee.amountMinor,expected);}
 x.route.meters=10001;assert.equal(calc(x).reason,'outside_area');
});
