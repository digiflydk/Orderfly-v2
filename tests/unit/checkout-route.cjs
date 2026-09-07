const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const origin='https://example.test';
const input=()=>[[{id:'p',name:'Pizza',quantity:1,unitPrice:100,totalPrice:100}],
 {name:'Test Customer',email:'test@example.test',phone:'12345678',subscribeToNewsletter:false,acceptTerms:true},
 'pickup','b','l',{subtotal:100,deliveryFee:0,discountTotal:0,tips:0,taxes:0},null,'brand','location',null,null];
async function run({body=input(),headers={},fail=false,raw}={}){
 const calls=[];
 const {POST}=loadTs('src/app/api/checkout/session/route.ts',{
  '@/lib/url':{getOrigin:async()=>origin},
  '@/lib/checkout-attempt':{runCheckoutAttempt:async(key,input,create)=>create()},
  '@/app/checkout/actions':{createStripeCheckoutSessionAction:async(...args)=>{calls.push(args);if(fail)throw Error('response uncertain');return {success:true,url:'https://checkout.stripe.test/session',orderId:'ORD-TEST'};}},
 });
 const request=new Request(origin+'/api/checkout/session',{method:'POST',headers:{origin,'content-type':'application/json','idempotency-key':'a'.repeat(64),...headers},body:raw??JSON.stringify(body)});
 const response=await POST(request);return {status:response.status,body:await response.json(),calls,cache:response.headers.get('cache-control')};
}
test('same-origin HTTP checkout delegates validated arguments and normalizes absent optional values',async()=>{
 const result=await run();assert.equal(result.status,200);assert.equal(result.body.success,true);assert.equal(result.calls.length,1);
 assert.deepEqual(result.calls[0].slice(0,9),input().slice(0,9));assert.equal(result.calls[0][9],undefined);assert.equal(result.calls[0][10],undefined);assert.equal(result.cache,'no-store');
});
for(const headers of [{origin:'https://other.test'},{origin:''},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'}])test(`reject untrusted request headers ${JSON.stringify(headers)} before order creation`,async()=>{
 const r=await run({headers});assert.equal(r.status,403);assert.equal(r.calls.length,0);
});
for(const scenario of ['terms','delivery','email','quantity','empty-cart','identifier'])test(`reject invalid ${scenario} before order creation`,async()=>{
 const body=input();
 if(scenario==='terms')body[1].acceptTerms=false;
 if(scenario==='delivery')body[2]='delivery';
 if(scenario==='email')body[1].email='broken';
 if(scenario==='quantity')body[0][0].quantity=-1;
 if(scenario==='empty-cart')body[0]=[];
 if(scenario==='identifier')body[3]='other/brand';
 const r=await run({body});assert.equal(r.status,400);assert.equal(r.calls.length,0);
});
test('valid delivery forwards the complete address',async()=>{
 const body=input();body[2]='delivery';Object.assign(body[1],{street:'Testvej 1',zipCode:'2900',city:'Hellerup'});
 const r=await run({body});assert.equal(r.body.success,true);assert.equal(r.calls[0][1].street,'Testvej 1');
});
for(const raw of ['{broken','x'.repeat(128*1024+1)])test(`invalid or oversized body (${raw.length} bytes) never creates an order`,async()=>{
 const r=await run({raw});assert.equal(r.status,400);assert.equal(r.calls.length,0);
});
test('unexpected payment handler exception remains uncertain and cannot be retried blindly',async()=>{
 const r=await run({fail:true});assert.equal(r.status,503);assert.equal(r.body.retryable,false);assert.equal(r.calls.length,1);
});
