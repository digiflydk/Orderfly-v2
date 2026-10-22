const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');

// Runs the real script against a stubbed Firestore Admin API; no network, no credentials.
// Like production, the stub rejects any field call on the reserved __name__ field.
const stub=`
import fs from 'node:fs';
const state=JSON.parse(fs.readFileSync(process.env.STUB_STATE,'utf8'));
const save=()=>fs.writeFileSync(process.env.STUB_STATE,JSON.stringify(state));
globalThis.setTimeout=(fn)=>{fn();return 0;};
const reply=(status,body)=>new Response(JSON.stringify(body),{status});
globalThis.fetch=async(url,init={})=>{
 const u=new URL(url),method=init.method||'GET';
 state.calls.push(method+' '+decodeURIComponent(u.pathname)+u.search);
 if(u.pathname.endsWith('/documents:runQuery')){state.queries.push(JSON.parse(init.body).structuredQuery);save();
  return state.queryStatus===200?reply(200,[{document:{name:'x'}}]):reply(state.queryStatus,{error:{message:'denied'}});}
 save();
 const field=u.pathname.match(/collectionGroups\\/([^/]+)\\/fields\\/(.+)$/);
 if(field){
  const id=field[1]+'.'+decodeURIComponent(field[2]);
  if(decodeURIComponent(field[2])==='__name__')return reply(400,{error:{message:'Field path id "__name__" is invalid because it is reserved.'}});
  if(method==='PATCH'){state.patches[id]=JSON.parse(init.body);state.fields[id]=state.patches[id].indexConfig.indexes.map(i=>({...i,state:'READY'}));save();return reply(200,{name:'op'});}
  return reply(200,{indexConfig:{indexes:state.fields[id]||[]}});
 }
 if(method==='POST')return reply(409,{});
 const group=u.pathname.match(/collectionGroups\\/([^/]+)\\/indexes/)[1];
 const file=JSON.parse(fs.readFileSync(process.env.STUB_FILE,'utf8'));
 return reply(200,{indexes:file.indexes.filter(i=>i.collectionGroup===group).map(i=>({...i,state:'READY'}))});
};`;
function run(state,file='docs/qr-firestore-indexes.json'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fi-')),stateFile=path.join(dir,'state.json'),preload=path.join(dir,'stub.mjs');
 fs.writeFileSync(stateFile,JSON.stringify({calls:[],patches:{},queries:[],fields:{},queryStatus:200,...state}));fs.writeFileSync(preload,stub);
 const r=spawnSync(process.execPath,['--import',preload,'scripts/firestore-indexes.mjs',file],
  {encoding:'utf8',env:{...process.env,FIRESTORE_ACCESS_TOKEN:'test',STUB_STATE:stateFile,STUB_FILE:file}});
 return {...r,state:JSON.parse(fs.readFileSync(stateFile,'utf8'))};
}
function manifest(fieldOverrides){
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'fi-docs-')),'test-firestore-indexes.json');
 fs.writeFileSync(file,JSON.stringify({indexes:[{collectionGroup:'things',queryScope:'COLLECTION',fields:[{fieldPath:'a',order:'ASCENDING'},{fieldPath:'b',order:'ASCENDING'}]}],fieldOverrides}));
 return file;
}

test('reserved __name__ is never configured; the collection-group document-name query is probed with and without a cursor',()=>{
 const r=run({});
 assert.equal(r.status,0,r.stderr);
 assert.ok(!r.state.calls.some(c=>c.includes('/fields/')),r.state.calls.join('\n'));
 assert.deepEqual(r.state.patches,{});
 assert.match(r.stdout,/builtin {3}qrScanEvents\.__name__/);
 assert.match(r.stdout,/builtin {3}qrRateLimits\.__name__/);
 assert.equal(r.state.queries.length,4);
 for(const q of r.state.queries){
  assert.equal(q.from[0].allDescendants,true);assert.deepEqual(q.select,{fields:[{fieldPath:'__name__'}]});
  assert.equal(q.orderBy[0].field.fieldPath,'__name__');assert.equal(q.limit,1);
 }
 assert.equal(r.state.queries.filter(q=>q.startAt).length,2);
 assert.match(r.stdout,/query {5}qrScanEvents collection group ordered by __name__: OK/);
 assert.match(r.stdout,/query {5}qrRateLimits collection group ordered by __name__ after a cursor: OK/);
 assert.match(r.stdout,/All 3 indexes are READY\./);
});

test('a configurable override is added additively and keeps the field\'s existing indexes',()=>{
 const file=manifest([{collectionGroup:'things',fieldPath:'c',indexes:[{order:'ASCENDING',queryScope:'COLLECTION_GROUP'}]}]);
 const kept={queryScope:'COLLECTION',fields:[{fieldPath:'c',order:'DESCENDING'}],state:'READY'};
 const r=run({fields:{'things.c':[kept]}},file);
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(r.state.patches['things.c'].indexConfig.indexes,[{queryScope:'COLLECTION',fields:kept.fields},{queryScope:'COLLECTION_GROUP',fields:[{fieldPath:'c',order:'ASCENDING'}]}]);
 assert.ok(r.state.calls.some(c=>c==='PATCH /v1/projects/orderfly-39325/databases/(default)/collectionGroups/things/fields/c?updateMask=indexConfig'));
 assert.ok(r.state.calls.every(c=>!c.startsWith('DELETE')));
 assert.match(r.stdout,/All 2 indexes are READY\./);
});

test('an existing configurable override is reported and not patched again',()=>{
 const file=manifest([{collectionGroup:'things',fieldPath:'c',indexes:[{order:'ASCENDING',queryScope:'COLLECTION_GROUP'}]}]);
 const r=run({fields:{'things.c':[{queryScope:'COLLECTION_GROUP',fields:[{fieldPath:'c',order:'ASCENDING'}],state:'READY'}]}},file);
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(r.state.patches,{});
 assert.match(r.stdout,/exists {4}things\.c \(COLLECTION_GROUP:ASCENDING\)/);
});

test('an index-only principal reports the query readiness as not verified without failing',()=>{
 const r=run({queryStatus:403});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/NOT VERIFIED, principal has no read access \(HTTP 403\)/);
});

test('a failing document-name query fails the run',()=>{
 const r=run({queryStatus:400});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/HTTP 400/);
});
