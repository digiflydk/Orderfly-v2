const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture({failCache=false}={}){
 const records=new Map();let queue=Promise.resolve();let cacheWrites=0;
 const {runCheckoutAttempt}=loadTs('src/lib/checkout-attempt.ts',{
  '@/lib/firebase':{db:{}},
  'firebase/firestore':{doc:(_,collection,id)=>collection+'/'+id,serverTimestamp:()=>new Date(),
   runTransaction:(_,fn)=>{const result=queue.then(()=>fn({get:async ref=>({exists:()=>records.has(ref),data:()=>records.get(ref)}),set:(ref,data)=>records.set(ref,data)}));queue=result.catch(()=>{});return result;},
   updateDoc:async(ref,data)=>{cacheWrites++;if(failCache)throw Error('cache offline');records.set(ref,{...records.get(ref),...data});},
  },
 });return {runCheckoutAttempt,records,writes:()=>cacheWrites};
}
const key='a'.repeat(64),input={brand:'b',basket:['pizza']};
test('concurrent/replayed HTTP requests create one session and recover the same encrypted result',async()=>{
 const f=fixture();let calls=0,finish;
 const result={success:true,url:'https://checkout.stripe.test/private-session',orderId:'ORD-ONE'};
 const create=async()=>{calls++;return new Promise(resolve=>{finish=()=>resolve(result);});};
 const first=f.runCheckoutAttempt(key,input,create);
 await new Promise(resolve=>setImmediate(resolve));
 const second=await f.runCheckoutAttempt(key,input,create);assert.equal(second.pending,true);assert.equal(calls,1);
 finish();assert.deepEqual(await first,result);
 assert.deepEqual(await f.runCheckoutAttempt(key,input,create),result);assert.equal(calls,1);
 const stored=JSON.stringify([...f.records]);assert.ok(!stored.includes(result.url));assert.ok(!stored.includes(key));
 const [documentId,record]=[...f.records][0];
 // Public document IDs must never double as the encryption key.
 const {createDecipheriv}=require('node:crypto');
 const wrongKey=createDecipheriv('aes-256-gcm',Buffer.from(documentId.split('/')[1],'hex'),Buffer.from(record.iv,'hex'));
 wrongKey.setAuthTag(Buffer.from(record.tag,'hex'));
 assert.throws(()=>{wrongKey.update(Buffer.from(record.result,'hex'));wrongKey.final();});
});
test('same attempt key cannot be reused with another basket',async()=>{
 const f=fixture();let calls=0;const create=async()=>{calls++;return {success:true,url:'https://checkout.stripe.test/session'};};
 await f.runCheckoutAttempt(key,input,create);
 const result=await f.runCheckoutAttempt(key,{brand:'other'},create);assert.equal(result.success,false);assert.equal(result.retryable,false);assert.equal(calls,1);
});
test('lost cache writes preserve the known response, while repeats stay pending without another payment',async()=>{
 const f=fixture({failCache:true});let calls=0;const create=async()=>{calls++;return {success:true,url:'https://checkout.stripe.test/session'};};
 assert.equal((await f.runCheckoutAttempt(key,input,create)).success,true);assert.equal(f.writes(),2);
 assert.equal((await f.runCheckoutAttempt(key,input,create)).pending,true);assert.equal(calls,1);
});
test('an uncertain operation exception is cached and never re-executes payment',async()=>{
 const f=fixture();let calls=0;const create=async()=>{calls++;throw Error('unknown outcome');};
 const result=await f.runCheckoutAttempt(key,input,create);assert.equal(result.retryable,false);
 assert.deepEqual(await f.runCheckoutAttempt(key,input,create),result);assert.equal(calls,1);
});
test('a corrupt cached result fails closed without executing payment',async()=>{
 const f=fixture();let calls=0;const create=async()=>{calls++;return {success:true,url:'https://checkout.stripe.test/session'};};
 await f.runCheckoutAttempt(key,input,create);[...f.records.values()][0].tag='00'.repeat(16);
 await assert.rejects(f.runCheckoutAttempt(key,input,create));assert.equal(calls,1);
});
