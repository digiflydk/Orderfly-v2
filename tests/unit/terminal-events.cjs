const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
class AuthorityError extends Error {constructor(code,status=403){super(code);this.status=status;}}
function fixture(options={}) {
 const watches=[],state={allowed:true,authorizations:0};
 const ref=(path,filters=[])=>({path,filters,collection:name=>ref(path+'/'+name),doc:id=>ref(path+'/'+id),where:(...condition)=>ref(path,[...filters,condition]),
  onSnapshot(callback,error){const watcher={path,filters,callback,error,stopped:false};watches.push(watcher);queueMicrotask(()=>{if(!watcher.stopped)callback(path==='orders'?{docChanges:()=>[]}:{});});return()=>{watcher.stopped=true;};}});
 const db={collection:name=>ref(name),runTransaction:async fn=>fn({})};
 const authorize=async()=>{state.authorizations++;if(options.failure)throw new AuthorityError('failure',options.failure);if(!state.allowed)throw new AuthorityError('forbidden');return{locations:[{brandId:'b1',locationId:'l1'}]};};
 const {terminalEvents}=loadTs('src/lib/orders/terminal-events.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/access/authority':{AuthorityError},'./kds-scope':{resolveKdsScope:authorize},'@/lib/terminal-auth/access':{getOrderTerminalActor:async()=>{await authorize();return {kind:'terminal',session:{sessionId:'s1',brandId:'b1',locationId:'l1'}};},authorizeOrderTerminalTransaction:async(_tx,actor,scope)=>{if(scope.brandId!==actor.session.brandId||scope.locationId!==actor.session.locationId)throw new AuthorityError('forbidden');}}});
 const controller=new AbortController();
 return{watches,state,ref,abort:()=>controller.abort(),open:(query='brandId=b1&locationId=l1',source='kds')=>terminalEvents(new Request('https://esmeralda.orderfly.dk/api/kds/orders/events?'+query,{signal:controller.signal}),source)};
}
const read=async reader=>new TextDecoder().decode((await reader.read()).value);
test('events reject malformed, duplicate and foreign scopes before subscriptions',async()=>{
 for(const query of ['brandId=b1','brandId=b1&locationId=l1&view=history','brandId=b1&brandId=b2&locationId=l1']){const f=fixture();assert.equal((await f.open(query)).status,400);assert.equal(f.watches.length,0);}
 for(const source of ['kds','terminal']){const f=fixture();assert.equal((await f.open('brandId=b2&locationId=l1',source)).status,403);assert.equal(f.watches.length,0);}
 for(const status of [401,403,503]){const f=fixture({failure:status});assert.equal((await f.open()).status,status);assert.equal(f.watches.length,0);}
});
test('events are scoped, notification-only, coalesced and cleaned up on abort',async t=>{
 const f=fixture();t.after(f.abort);const response=await f.open(),reader=response.body.getReader();
 assert.equal(response.headers.get('content-type'),'text/event-stream');assert.match(await read(reader),/event: ready/);assert.equal(f.state.authorizations,2);
 const orders=f.watches.filter(w=>w.path==='orders');assert.equal(orders.length,3);
 orders.forEach(w=>{assert.deepEqual(w.filters.slice(0,2),[['brandId','==','b1'],['locationId','==','l1']]);w.callback({docChanges:()=>[]});});
 assert.equal(await read(reader),'event: change\ndata: {}\n\n');
 f.abort();assert.equal((await reader.read()).done,true);assert.ok(f.watches.every(w=>w.stopped));
});
test('policy change invalidates access, never emits saved customer data',async t=>{
 const f=fixture();t.after(f.abort);const response=await f.open(),reader=response.body.getReader();await read(reader);
 f.watches.find(w=>w.path==='platformAdminControl/access-v1').callback({secret:'not for client'});
 assert.equal(await read(reader),'event: access\ndata: {}\n\n');assert.equal((await reader.read()).done,true);assert.ok(f.watches.every(w=>w.stopped));
});
test('dedicated sessions watch credential and session revocation',async t=>{
 const f=fixture();t.after(f.abort);const response=await f.open(undefined,'terminal'),reader=response.body.getReader();await read(reader);
 assert.ok(f.watches.some(w=>w.path==='terminalCredentials/l1'));f.watches.find(w=>w.path==='terminalSessions/s1').callback({});assert.match(await read(reader),/event: access/);
});
test('delivery changes notify and departed orders unsubscribe their tracking',async t=>{
 const f=fixture();t.after(f.abort);const response=await f.open(),reader=response.body.getReader();await read(reader);
 const orders=f.watches.find(w=>w.path==='orders'),doc={id:'o1',ref:f.ref('orders/o1'),data:()=>({managedDelivery:{},customerName:'secret'})};
 orders.callback({docChanges:()=>[{type:'added',doc}]});assert.equal(await read(reader),'event: change\ndata: {}\n\n');
 const tracking=f.watches.filter(w=>w.path.startsWith('orders/o1/'));assert.equal(tracking.length,5);
 tracking[0].callback({});assert.match(await read(reader),/event: change/);
 orders.callback({docChanges:()=>[{type:'removed',doc}]});assert.ok(tracking.every(w=>w.stopped));
});
test('listener errors fail closed and cancellation releases all subscriptions',async()=>{
 const f=fixture(),response=await f.open(),reader=response.body.getReader();await read(reader);f.watches[0].error(Error('database'));assert.match(await read(reader),/event: unavailable/);assert.ok(f.watches.every(w=>w.stopped));
 const g=fixture(),other=await g.open(),r=other.body.getReader();await read(r);await r.cancel();assert.ok(g.watches.every(w=>w.stopped));
});
