const {test}=require('node:test');const assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
const {DeterministicDeliveryTestProvider:Provider}=loadTs('src/lib/delivery/providers/test/index.ts');
const cost={amountMinor:2500,currency:'DKK',taxBasis:'inclusive',taxMinor:500};
const scope={brandId:'a',locationId:'a1'},addr={country:'DK',postcode:'2300',city:'Test',street:'Test Street',building:'1',unit:null,coordinates:{latitude:55.6,longitude:12.5,source:'fixture'}};
const fulfillment={version:1,scope,checkoutRef:'c1',providerId:'test',pickup:addr,dropoff:addr,pickupContact:{name:'Store',phone:'123'},dropoffContact:{name:'Customer',phone:'456'},instructions:'',readyAt:'2026-10-25T12:00:00Z',desiredDelivery:{kind:'asap'},items:[{name:'Pizza',quantity:1}],bagCount:1,requirements:[]};
const request=q=>({version:1,scope,providerId:'test',orderRef:'o1',attemptRef:'a1',quoteRef:q.quoteRef,requestDigest:'a'.repeat(64),readyAt:fulfillment.readyAt,deliveryInterval:null,quotedCost:cost,fulfillment});
test('lost response reconciles one accepted booking and rejects changed same-key payload',async()=>{
 const p=new Provider({environment:'test',cost,now:()=>100,mode:'lost_response'}),q=await p.quote(fulfillment),r=request(q);
 assert.equal((await p.create(r)).kind,'unknown');
 const found=await p.reconcile({scope,attemptRef:'a1',providerDeliveryId:null});assert.equal(found.kind,'found');
 assert.deepEqual(await p.create(r),found.delivery);
 assert.equal((await p.create({...r,requestDigest:'b'.repeat(64)})).kind,'rejected');
 assert.equal((await p.reconcile({scope:{...scope,brandId:'b'},attemptRef:'a1',providerDeliveryId:null})).kind,'unknown');
});
test('expired quote, unavailable and definitive rejection remain distinct',async()=>{
 let now=100;const p=new Provider({environment:'test',cost,now:()=>now}),q=await p.quote(fulfillment);now=60100;
 assert.equal((await p.create(request(q))).kind,'rejected');
 assert.equal((await new Provider({environment:'test',cost,now:()=>100,unavailable:true}).quote(fulfillment)).kind,'unavailable');
 const reject=new Provider({environment:'test',cost,now:()=>100,mode:'reject'});assert.equal((await reject.create(request(await reject.quote(fulfillment)))).kind,'rejected');
});
test('cancellation scope is enforced and production cannot instantiate test provider',async()=>{
 const p=new Provider({environment:'test',cost,now:()=>100}),created=await p.create(request(await p.quote(fulfillment)));
 const cancel={scope,attemptRef:'a1',providerDeliveryId:created.providerDeliveryId,acceptedFee:null,feeQuoteRef:null,feeQuoteRevision:null,operatorReason:'Customer requested cancellation'};
 assert.equal((await p.cancel({...cancel,scope:{...scope,brandId:'b'}})).kind,'not_cancellable');
 assert.equal((await p.cancel(cancel)).kind,'cancelled');assert.equal((await p.cancel(cancel)).kind,'cancelled');
 assert.throws(()=>new Provider({environment:'production',cost,now:()=>100}),/forbidden/);
});

test('definitive rejection binds attempt key even if the caller obtains another quote',async()=>{
 let now=100;const p=new Provider({environment:'test',cost,now:()=>now});const old=request(await p.quote(fulfillment));now=60100;assert.equal((await p.create(old)).error.code,'quote_invalid');
 const fresh=request(await p.quote(fulfillment));assert.equal((await p.create(fresh)).error.code,'idempotency_conflict');assert.equal((await p.create(old)).error.code,'quote_invalid');
});
