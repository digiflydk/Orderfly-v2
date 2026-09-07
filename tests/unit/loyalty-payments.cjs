const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(path,mocks={}){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(n=>n in mocks?mocks[n]:require(n),mod,mod.exports);return mod.exports;}
function fixture(){
 const rows=new Map([['orders/o',{brandId:'b',locationId:'l',customerDetails:{id:'c'},totalAmount:100,paymentStatus:'Pending',psp:{checkoutSessionId:'cs_o'}}],['customers/c',{brandId:'b',totalOrders:0,totalSpend:0}]]),events=[];
 const firestore={doc:(_,coll,id)=>coll+'/'+id,serverTimestamp:()=>new Date(),runTransaction:async(_,fn)=>{
  const writes=[];let wrote=false;
  const result=await fn({get:async ref=>{assert.equal(wrote,false);return {exists:()=>rows.has(ref),data:()=>structuredClone(rows.get(ref))};},update:(ref,patch)=>{wrote=true;writes.push(()=>{const data=rows.get(ref);for(const [key,v]of Object.entries(patch)){const parts=key.split('.');if(parts.length===2){data[parts[0]]||={};data[parts[0]][parts[1]]=v;}else data[key]=v;}});}});
  writes.forEach(w=>w());return result;
 }};
 const mocks={'server-only':{},'@/lib/firebase':{db:{}},'firebase/firestore':firestore,'@/lib/discount-reservations':{prepareCapacitySettlement:async()=>()=>events.push('capacity')},'@/lib/loyalty/rewards':{settleRewards:async(...args)=>events.push(args),refundRewards:async(...args)=>events.push(args)}};
 return {rows,events,pay:load('src/lib/payments/settlement.ts',mocks).fulfillPaidSession,refund:load('src/lib/payments/refunds.ts',mocks).processRefund};
}
const session={id:'cs_o',created:1788782400,metadata:{orderId:'o',brandId:'b',locationId:'l'},payment_status:'paid',status:'complete',currency:'dkk',amount_total:10000,payment_intent:'pi_o'};
const charge={metadata:session.metadata,currency:'dkk',amount:10000,payment_intent:'pi_o',amount_refunded:4000};
test('payment and confirmation share idempotent counters and retry reward settlement',async()=>{
 const f=fixture();assert.equal(await f.pay(session),true);assert.equal(await f.pay(session),false);
 assert.equal(f.rows.get('customers/c').totalOrders,1);assert.equal(f.rows.get('customers/c').totalSpend,100);
 assert.equal(f.events.filter(Array.isArray).length,2,'reward retry must still run after counters were committed');
});
test('unpaid complete session, wrong brand/session and manipulated amount cannot award',async()=>{
 const f=fixture();assert.equal(await f.pay({...session,payment_status:'unpaid'}),false);
 for(const bad of [{...session,id:'cs_other'},{...session,metadata:{...session.metadata,brandId:'other'}},{...session,amount_total:1}])await assert.rejects(f.pay(bad));
 assert.equal(f.events.length,0);assert.equal(f.rows.get('customers/c').totalOrders,0);
});
test('partial and full refunds correct aggregates once; refund-before-payment is netted',async()=>{
 const f=fixture();await f.pay(session);await f.refund(charge);await f.refund(charge);assert.equal(f.rows.get('customers/c').totalSpend,60);assert.equal(f.rows.get('customers/c').totalOrders,1);
 await f.refund({...charge,amount_refunded:10000});await f.refund(charge);assert.equal(f.rows.get('customers/c').totalSpend,0);assert.equal(f.rows.get('customers/c').totalOrders,0);
 const early=fixture();await early.refund(charge);await early.pay(session);assert.equal(early.rows.get('customers/c').totalSpend,60);
 await assert.rejects(f.refund({...charge,payment_intent:'pi_other'}));
});
test('deleted customer does not prevent paid order or reward settlement',async()=>{
 const f=fixture();f.rows.delete('customers/c');await f.pay(session);assert.equal(f.rows.get('orders/o').paymentStatus,'Paid');assert.ok(f.rows.get('orders/o').fulfillmentWarnings.includes('customer_deleted'));assert.ok(f.events.some(Array.isArray));
});
