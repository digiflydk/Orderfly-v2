const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const admin=require('firebase-admin');

function fixtureDb(){
 const rows=new Map();
 const snapshot=(key)=>({id:key.split('/')[1],data:()=>rows.get(key)});
 const collection=(name,filters=[])=>({
  doc:id=>({set:async data=>rows.set(`${name}/${id}`,data),get:async()=>snapshot(`${name}/${id}`)}),
  where:(field,op,value)=>collection(name,[...filters,{field,op,value}]),
  get:async()=>{const docs=[...rows].filter(([key,row])=>key.startsWith(name+'/')&&filters.every(({field,op,value})=>{
   const normalize=x=>x?.toDate?.()?.getTime?.()??(x instanceof Date?x.getTime():x);
   const a=normalize(row[field]),b=normalize(value);
   return op==='=='?a===b:op==='>='?a>=b:a<=b;
  })).map(([key])=>snapshot(key));return {docs,forEach:fn=>docs.forEach(fn)};},
 });return {rows,collection};
}
test('production collector accepts public origin behind proxy, rejects foreign origins and forged payments',async()=>{
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
 try{
  const saved=[];
  const {POST}=loadTs('src/app/api/analytics/collect/route.ts',{'@/lib/server/record-commerce-metric':{recordCommerceMetric:async(...args)=>saved.push(args)}});
  const send=(origin,name='view_menu',params={brandId:'b',locationId:'l',sessionId:'s',eventId:'e'})=>POST(new Request('http://0.0.0.0:8080/api/analytics/collect',{method:'POST',headers:{origin,'content-type':'application/json','x-forwarded-host':'evil.test'},body:JSON.stringify({name,params})}));
  assert.equal((await send('https://orderfly.dk')).status,204);
  assert.equal(saved.length,1);
  for(const origin of ['https://evil.test','https://orderfly.dk.evil.test','http://orderfly.dk','null'])assert.equal((await send(origin)).status,403);
  assert.equal((await send('https://orderfly.dk','payment_succeeded')).status,400);
  assert.equal((await send('https://orderfly.dk','view_menu',{})).status,400);
  assert.equal(saved.length,1);
 }finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});
test('collected events reach filtered funnel; sales remain authoritative and conversion uses matched sessions',async()=>{
 const db=fixtureDb();const io={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}};
 // No external Measurement Protocol requests during an isolated test.
 const {recordCommerceMetric}=loadTs('src/lib/server/record-commerce-metric.ts',{...io,'@/lib/optional-checkout':{optionalCheckoutValue:async fn=>{if(String(fn).includes('fetch('))return;return fn();}}});
 const {POST}=loadTs('src/app/api/analytics/collect/route.ts',{'@/lib/server/record-commerce-metric':{recordCommerceMetric}});
 for(const [index,name] of ['view_menu','view_product','add_to_cart','start_checkout','click_purchase'].entries()){
  const body={name,params:{brandId:'b',locationId:'l',sessionId:'measured',eventId:`e${index}`,source:'google',deviceType:'mobile'}};
  const request=()=>new Request('https://orderfly.dk/api/analytics/collect',{method:'POST',headers:{origin:'https://orderfly.dk'},body:JSON.stringify(body)});
  assert.equal((await POST(request())).status,204);await POST(request()); // identical event ID is idempotent
 }
 const now=new Date();
 db.rows.set('analytics_events/server',{name:'payment_succeeded',brandId:'b',locationId:'l',sessionId:'server-only',ts:now});
 db.rows.set('analytics_events/payment-created',{name:'payment_session_created',brandId:'b',locationId:'l',sessionId:'server-only',source:'google',deviceType:'mobile',ts:now});
 db.rows.set('analytics_events/vital',{name:'web_vital',brandId:'b',locationId:'l',sessionId:'vitals-only',ts:now});
 db.rows.set('analytics_events/other',{name:'view_menu',brandId:'other',locationId:'other',sessionId:'other',ts:now});
 db.rows.set('locations/l',{name:'Fixture'});
 for(const [id,session,status,amount] of [['o1','measured','Paid',100],['o2','measured','Paid',50],['o3','unmeasured','Paid',75],['pending','measured','Pending',999]]){
  db.rows.set(`orders/${id}`,{id,brandId:'b',locationId:'l',paidAt:admin.firestore.Timestamp.fromDate(now),paymentStatus:status,totalAmount:amount,analytics:{sessionId:session,deviceType:'mobile',attribution:{source:'google'}}});
 }
 const {getFunnelData}=loadTs('src/lib/analytics/getFunnelData.ts',io);
 const filters={dateFrom:now.toISOString(),dateTo:now.toISOString(),brandId:'b',locationId:'l',counting:'events',device:'mobile',utmSource:'google'};
 const result=await getFunnelData(filters);
 assert.equal(result.totals.sessions,1);
 assert.equal(result.totals.payment_session_created,1,'server metric remains visible without creating a browser session');
 for(const step of ['view_menu','view_product','add_to_cart','start_checkout','click_purchase'])assert.equal(result.totals[step],1);
 assert.equal(result.totals.payment_succeeded,3);assert.equal(result.totals.revenue_paid,225);
 assert.equal(result.totals.paidOrders,3);assert.equal(result.totals.measuredPaidOrders,2);
 assert.equal(result.totals.measuredPurchasingSessions,1);assert.equal(result.byLocation[0].convSessionsToPurchase,100);
 assert.equal(result.daily[0].sessions,1);
 assert.equal((await getFunnelData({...filters,utmSource:'meta'})).totals.sessions,0);
 assert.equal((await getFunnelData({...filters,locationId:'missing'})).totals.payment_succeeded,0);
 assert.equal((await getFunnelData({...filters,counting:'unique'})).totals.payment_succeeded,2);
});

test('paid orders never fabricate missing payment clicks or measured sessions',async()=>{
 const db=fixtureDb(),now=new Date();
 db.rows.set('locations/l',{name:'Fixture'});
 for(let i=0;i<29;i++)db.rows.set(`orders/paid-${i}`,{id:`paid-${i}`,brandId:'b',locationId:'l',paidAt:admin.firestore.Timestamp.fromDate(now),paymentStatus:'Paid',totalAmount:100});
 const {getFunnelData}=loadTs('src/lib/analytics/getFunnelData.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}});
 const result=await getFunnelData({dateFrom:now.toISOString(),dateTo:now.toISOString(),brandId:'b',counting:'events'});
 assert.equal(result.totals.paidOrders,29);
 assert.equal(result.totals.click_purchase,0);
 assert.equal(result.totals.sessions,0);
 assert.equal(result.totals.measuredPaidOrders,0);
 assert.equal(result.totals.measuredPurchasingSessions,0);
 assert.ok(result.dataQualityWarnings.some(message=>message.includes('ingen målte betalingsklik')));
});
