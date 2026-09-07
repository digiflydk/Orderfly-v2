const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(path,mocks={}) {const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(n=>n in mocks?mocks[n]:require(n),mod,mod.exports);return mod.exports;}
const model=load('src/lib/loyalty/model.ts');
const settingsApi=load('src/app/superadmin/loyalty/actions.ts',{'next/cache':{},'@/lib/firebase':{db:{}},'firebase/firestore':{doc:()=>({}),getDoc:async()=>({exists:()=>false})},'@/lib/loyalty/model':model,'@/lib/loyalty/identity':{},'@/lib/firebase-admin':{}});
test('scoring distinguishes recent and frequent paid customers, excludes unpaid/cancelled/refunded orders',async()=>{
 const s=await settingsApi.getLoyaltySettings(),now=new Date('2026-09-07T12:00:00Z');
 const order=days=>({totalAmount:300,paymentStatus:'Paid',deliveryType:'Pickup',createdAt:new Date(+now-days*86400000)});
 const loyal=Array.from({length:12},(_,i)=>order(i));
 const best=model.customerMetrics(loyal,s,now);assert.equal(best.loyaltyClassification,'Loyal');assert.equal(best.loyaltyScore,91);
 assert.ok(model.customerMetrics([order(0)],s,now).loyaltyScore>model.customerMetrics([order(120)],s,now).loyaltyScore);
 assert.deepEqual(model.customerMetrics([...loyal,{...order(0),paymentStatus:'Pending',deliveryType:'Delivery'},{...order(0),status:'Canceled'},{...order(0),refundedAmountOre:30000}],s,now),best);
 const partial=model.customerMetrics([{...order(0),refundedAmountOre:10000}],s,now);assert.equal(partial.totalSpend,200);
 assert.equal(model.customerMetrics([],s,now).loyaltyClassification,'New');
 assert.ok(!model.scoreSettingsSchema.safeParse({...s,classifications:{...s.classifications,loyal:{min:-1,max:100}}}).success);
 assert.ok(!model.scoreSettingsSchema.safeParse({...s,thresholds:{...s.thresholds,frequency:[{points:50,value:8},{points:100,value:0}]}}).success);
});
test('integer quotes enforce minimum, cap, balance and disabled program',()=>{
 const p={...model.defaultProgram,enabled:true};
 assert.deepEqual(model.rewardQuote(p,2000,10000,2000),{redeemOre:2000,earnOre:400});
 for(const amount of [-1,1.5,99,6000])assert.throws(()=>model.rewardQuote(p,2000,10000,amount));
 assert.deepEqual(model.rewardQuote({...p,enabled:false},2000,10000,0),{redeemOre:0,earnOre:0});
 assert.throws(()=>model.rewardQuote({...p,enabled:false},2000,10000,1000));
 assert.deepEqual(model.refundTargets(400,2000,4200,8400),{reversed:200,restored:1000});
});
function rewardStore() {
 const rows=new Map(),clone=v=>v===undefined?undefined:structuredClone(v);let queue=Promise.resolve();
 function ref(path){return {id:path.split('/').at(-1),path,collection:n=>collection(path+'/'+n),get:async()=>snap(path)};}
 const collection=path=>({doc:id=>ref(path+'/'+id)}),snap=path=>({exists:rows.has(path),data:()=>clone(rows.get(path))});
 const db={collection,runTransaction:fn=>{const run=queue.then(async()=>{const writes=[];let wrote=false;const result=await fn({get:async r=>{assert.equal(wrote,false,'transaction reads precede writes');return snap(r.path);},set:(r,v)=>{wrote=true;writes.push(()=>rows.set(r.path,clone(v)));},create:(r,v)=>{assert.ok(!rows.has(r.path));wrote=true;writes.push(()=>rows.set(r.path,clone(v)));},update:(r,v)=>{wrote=true;writes.push(()=>rows.set(r.path,{...rows.get(r.path),...clone(v)}));}});writes.forEach(w=>w());return result;});queue=run.catch(()=>{});return run;}};
 const api=load('src/lib/loyalty/rewards.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'./model':model});
 const p={...model.defaultProgram,enabled:true};rows.set('loyalty_programs/b',{program:p});
 return {rows,api,p,wallet:()=>[...rows.entries()].find(([k])=>/^loyalty_wallets\/[^/]+$/.test(k))?.[1]};
}
test('ledger earns once, reserves atomically, releases once and settles net refund',async()=>{
 const {api,p,rows,wallet}=rewardStore();
 await api.reserveRewards('seed','b','u',0,100000,100000,p);await api.settleRewards('seed','b',true,100000);await api.settleRewards('seed','b',true,100000);assert.equal(wallet().balanceOre,5000);
 const simultaneous=await Promise.allSettled([api.reserveRewards('a','b','u',4000,10000,10000,p),api.reserveRewards('b','b','u',4000,10000,10000,p)]);
 assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1);assert.equal(wallet().heldOre,4000);
 await api.settleRewards('a','b',false);await api.settleRewards('a','b',false);assert.equal(wallet().heldOre,0);assert.equal(wallet().balanceOre,5000);
 await api.reserveRewards('c','b','u',2000,10000,10000,p);await api.refundRewards('c','b',4000);await api.settleRewards('c','b',true,8000);
 assert.equal(wallet().balanceOre,4200);assert.equal(wallet().heldOre,0);
 await api.refundRewards('c','b',8000);await api.refundRewards('c','b',4000);await api.refundRewards('c','b',8000);assert.equal(wallet().balanceOre,5000);
 await assert.rejects(api.settleRewards('c','other',true,8000),/scope/);
 await assert.rejects(api.settleRewards('c','b',true,1),/amount/);
 assert.equal(rows.get('loyalty_orders/c').status,'paid');
});
test('refund after spending retains debt and does not mint replacement credit',async()=>{
 const {api,p,wallet}=rewardStore();await api.reserveRewards('seed','b','u',0,100000,100000,p);await api.settleRewards('seed','b',true,100000);
 await api.reserveRewards('spend','b','u',5000,10000,10000,p);await api.settleRewards('spend','b',true,5000);assert.equal(wallet().balanceOre,250);
 await api.refundRewards('seed','b',100000);assert.equal(wallet().balanceOre,-4750);
 await assert.rejects(api.reserveRewards('again','b','u',100,10000,10000,p),/Saldo/);
});
test('verified identity checks email ownership and explicit administrator UID',async()=>{
 let claims={uid:'u',email:'a@example.test',email_verified:true},checkedRevocation;
 const api=load('src/lib/loyalty/identity.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminApp:()=>({auth:()=>({verifyIdToken:async(_,check)=>{checkedRevocation=check;return claims;}})})}});
 assert.equal((await api.verifiedCustomer('token','a@example.test')).uid,'u');assert.equal(checkedRevocation,true);
 await assert.rejects(api.verifiedCustomer('token','someone@example.test'));
 claims.email_verified=false;await assert.rejects(api.verifiedCustomer('token'));claims.email_verified=true;
 const previous=process.env.LOYALTY_ADMIN_UIDS;process.env.LOYALTY_ADMIN_UIDS='other';
 try{await assert.rejects(api.requireLoyaltyAdmin('token'));process.env.LOYALTY_ADMIN_UIDS='u';assert.equal((await api.requireLoyaltyAdmin('token')).uid,'u');}finally{if(previous===undefined)delete process.env.LOYALTY_ADMIN_UIDS;else process.env.LOYALTY_ADMIN_UIDS=previous;}
});
