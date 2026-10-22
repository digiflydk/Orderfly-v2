const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {createQrHistoryService}=loadTs('src/lib/qr/history.ts');
const scope={brandId:'b1',actorId:'a1',locationIds:['l1']};
const code={id:'q1',brandId:'b1',locationId:'l1'};
const snapshot={...code,name:'Menu',destination:'https://example.org',campaign:'October',tags:['table'],expiresAt:null,status:'active',revision:1,secret:'NEVER_RETURN'};
const audit=(id,extra={})=>({id,data:()=>({at:1000,action:'update',actorId:'a1',revision:2,previousRevision:1,...extra})});
function fixture(docs=[],getCode=async()=>code){const trace=[];const ref=path=>({doc:id=>ref(path+'/'+id),collection:name=>ref(path+'/'+name),orderBy:(field,direction)=>{trace.push(['orderBy',path,field,direction]);return ref(path)},limit:n=>{trace.push(['limit',n]);return ref(path)},get:async()=>{trace.push(['query']);return{docs}}});
const db={collection:name=>{trace.push(['collection',name]);return ref(name)}};
return{trace,service:createQrHistoryService(db,{getCode:async(s,id)=>{trace.push(['getCode',s.brandId,id]);return getCode(s,id)}})};}
test('authorized helper scopes exact audit path, orders descending, caps51 and rechecks current code',async()=>{
 const docs=Array.from({length:51},(_,i)=>audit('event'+i));const{trace,service}=fixture(docs);const result=await service.read({...scope,locationIds:null},'q1');
 assert.equal(result.rows.length,50);assert.equal(result.truncated,true);assert.equal(result.discarded,0);
 assert.deepEqual(trace,[['getCode','b1','q1'],['collection','brands'],['orderBy','brands/b1/qrCodes/q1/audit','at','desc'],['limit',51],['query'],['getCode','b1','q1']]);
 assert.equal(result.rows[0].changes,undefined);
});
test('missing guard and foreign/empty/invalid scopes fail before an audit read',async()=>{
 assert.throws(()=>createQrHistoryService({},{}),/missing_scope_reader/);
 for(const saved of [{...code,brandId:'b2'},{...code,id:'q2'},{...code,locationId:'l2'},{...code,locationId:null},undefined]){
  const{trace,service}=fixture([],async()=>saved);await assert.rejects(()=>service.read(scope,'q1'));assert.equal(trace.some(v=>v[0]==='collection'),false);
 }
 for(const invalid of [{...scope,brandId:'../b2'},{...scope,actorId:''},{...scope,locationIds:[]}]){
  const{trace,service}=fixture();await assert.rejects(()=>service.read(invalid,'q1'));assert.deepEqual(trace,[]);
 }
 const{trace,service}=fixture([],async()=>{throw Error('denied')});await assert.rejects(()=>service.read(scope,'q1'));assert.equal(trace.some(v=>v[0]==='collection'),false);
});
test('a concurrent current-code move rejects the whole response after query',async()=>{
 let reads=0;const{service}=fixture([audit('event1')],async()=>++reads===1?code:{...code,locationId:'l2'});
 await assert.rejects(()=>service.read(scope,'q1'),error=>error.code==='forbidden');assert.equal(reads,2);
});
test('only actual allowlisted snapshot differences are returned and create has no invented prior state',async()=>{
 const{service}=fixture([audit('changed',{before:snapshot,after:{...snapshot,name:'Poster',status:'paused',secret:'ALSO_NEVER'}}),audit('created',{action:'create',revision:1,previousRevision:null,before:null,after:snapshot})]);
 const result=await service.read(scope,'q1');assert.deepEqual(result.rows[0].changes,[{field:'name',before:'Menu',after:'Poster'},{field:'status',before:'active',after:'paused'}]);
 assert.equal(result.rows[1].changes.find(c=>c.field==='name').before,null);assert.equal(JSON.stringify(result).includes('NEVER'),false);
});
test('narrow scope hides entire legacy, foreign and malformed rows including actor/time',async()=>{
 const{service}=fixture([audit('legacy'),audit('foreign',{before:{...snapshot,locationId:'l2',destination:'https://secret.example.org'},after:snapshot}),audit('malformed',{before:snapshot,after:{...snapshot,design:{secret:'NEVER'}}}),audit('bad',{actorId:'../../bad'})]);
 const result=await service.read(scope,'q1');assert.equal(result.rows.length,0);assert.equal(result.discarded,4);
 assert.equal(JSON.stringify(result).includes('secret.example.org'),false);assert.equal(result.truncated,false);
});
test('brand-wide legacy headers remain unknown while foreign-brand snapshots are discarded',async()=>{
 const{service}=fixture([audit('legacy'),audit('foreignbrand',{before:{...snapshot,brandId:'b2'},after:snapshot}),audit('malformed',{before:snapshot,after:{...snapshot,design:{secret:'NEVER'}}})]);
 const result=await service.read({...scope,locationIds:null},'q1');assert.equal(result.rows.length,2);assert.equal(result.discarded,1);assert.ok(result.rows.every(row=>row.changes===undefined));
});
test('brand-wide authorized viewer can inspect location change while no-change rows remain explicit',async()=>{
 const{service}=fixture([audit('move',{before:snapshot,after:{...snapshot,locationId:'l2'}}),audit('same',{before:snapshot,after:{...snapshot}})]);
 const result=await service.read({...scope,locationIds:null},'q1');assert.deepEqual(result.rows[0].changes,[{field:'locationId',before:'l1',after:'l2'}]);assert.deepEqual(result.rows[1].changes,[]);
});
