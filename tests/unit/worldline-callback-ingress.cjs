const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs'),{memoryDb}=require('../helpers/marketing-db.cjs');
function fixture(){
 const binding={provider:'worldline',owner:{brandId:'b'},mode:'test',merchantNumber:'T123',reference:'pinned-7'};
 const order={brandId:'b',locationId:'l',totalAmount:125,paymentStatus:'Pending',status:'Pending',psp:{provider:'worldline'},paymentAgreement:binding};
 const rows=new Map([['orders/ORD-123',order]]),db=memoryDb(rows),run=db.runTransaction;
 db.runTransaction=callback=>run(tx=>callback({...tx,update:(ref,input)=>{const next={...input};if(input['psp.transactionId']){next.psp={...rows.get(ref.path).psp,transactionId:input['psp.transactionId']};delete next['psp.transactionId'];}return tx.update(ref,next);}}));
 const after=[];let calls=0;
 const api=loadTs('src/app/api/payments/worldline/callback/route.ts',{'server-only':{},'next/server':{after:callback=>after.push(callback)},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/payments/worldline-store':{readPinnedWorldlineAgreement:async input=>{assert.equal(input.reference,'pinned-7');return {binding:input,credentials:{md5Key:'synthetic-md5'}};}},'@/lib/payments/worldline-reconcile':{reconcileWorldlineOrder:async()=>{calls++;}}});
 const request=(patch={},invalidHash=false)=>{const q=new URLSearchParams({txnid:'123',orderid:'ORD-123',amount:'12500',currency:'DKK',...patch});q.set('hash',invalidHash?'0'.repeat(32):createHash('md5').update([...q.values()].join('')+'synthetic-md5').digest('hex'));return new Request('https://example.test/api/payments/worldline/callback?'+q);};
 return {api,rows,request,after,calls:()=>calls};
}
test('callback before customer return durably admits exactly one transaction, never marks Paid',async()=>{
 const f=fixture();assert.equal((await f.api.GET(f.request())).status,200);assert.equal(f.rows.get('orders/ORD-123').paymentStatus,'Pending');assert.equal(f.rows.get('orders/ORD-123').psp.transactionId,'123');assert.equal(f.rows.get('worldlinePaymentJobs/ORD-123').state,'pending');
 assert.equal((await f.api.GET(f.request())).status,200);assert.equal([...f.rows].filter(([p])=>p.startsWith('worldlinePaymentJobs/')).length,1);assert.equal(f.calls(),0);await f.after[0]();assert.equal(f.calls(),1);
});
test('invalid hash, amount, currency or second transaction cannot enqueue or replace original payment',async()=>{
 for(const [patch,invalid]of [[{},true],[{amount:'1'},false],[{currency:'EUR'},false]]){const f=fixture();assert.notEqual((await f.api.GET(f.request(patch,invalid))).status,200);assert.equal(f.rows.has('worldlinePaymentJobs/ORD-123'),false);}
 const f=fixture();await f.api.GET(f.request());assert.notEqual((await f.api.GET(f.request({txnid:'456'}))).status,200);assert.equal(f.rows.get('orders/ORD-123').psp.transactionId,'123');
});
test('browser return cannot create a transaction without signed callback fields',async()=>{const f=fixture();assert.notEqual((await f.api.GET(new Request('https://example.test/api/payments/worldline/callback?orderid=ORD-123'))).status,200);assert.equal(f.rows.has('worldlinePaymentJobs/ORD-123'),false);});
