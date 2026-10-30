const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {deliveryTariffPreview:preview}=loadTs('src/lib/delivery/pricing/tariff-preview.ts');
const rules={version:'1',currency:'DKK',taxBasis:'inclusive',maxDistanceMeters:5000,minimumMinor:10000,maximumCustomerFeeMinor:10000,maximumSubsidyMinor:20000,tariff:{kind:'kilometer',baseMinor:3900,includedMeters:2000,perKmMinor:1000}};
test('distance price works without cart, contact or provider cost and preserves rounding',()=>{assert.equal(preview(rules,1000).baseFeeMinor,3900);assert.equal(preview(rules,2500).baseFeeMinor,4400);assert.equal(preview(rules,5001),null);assert.equal(preview(rules,NaN),null);assert.equal(preview({...rules,maximumCustomerFeeMinor:3800},1000),null);});
test('free-delivery eligibility stays separate from basic distance tariff',()=>{const r={...rules,freeDelivery:{minimumMinor:30000,maxDistanceMeters:2000}};assert.equal(preview(r,1000).freeMinimumMinor,30000);assert.equal(preview(r,2001).freeMinimumMinor,null);assert.equal(preview(r,1000).baseFeeMinor,3900);});
