const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');

// Runs the real script against a stubbed Firestore Admin API; no network, no credentials.
const stub=`
import fs from 'node:fs';
const state=JSON.parse(fs.readFileSync(process.env.STUB_STATE,'utf8'));
const save=()=>fs.writeFileSync(process.env.STUB_STATE,JSON.stringify(state));
globalThis.setTimeout=(fn)=>{fn();return 0;};
const reply=(status,body)=>new Response(JSON.stringify(body),{status});
globalThis.fetch=async(url,init={})=>{
 const u=new URL(url),method=init.method||'GET';
 state.calls.push(method+' '+decodeURIComponent(u.pathname)+u.search);save();
 if(u.pathname.endsWith('/documents:runQuery'))return state.queryStatus===200?reply(200,[{document:{name:'x'}}]):reply(state.queryStatus,{error:{message:'denied'}});
 const field=u.pathname.match(/collectionGroups\\/([^/]+)\\/fields\\/(.+)$/);
 if(field){
  const id=field[1]+'.'+decodeURIComponent(field[2]);
  if(method==='PATCH'){state.patches[id]=JSON.parse(init.body);state.fields[id]=state.patches[id].indexConfig.indexes.map(i=>({...i,state:'READY'}));save();return reply(200,{name:'op'});}
  return reply(200,{indexConfig:{indexes:state.fields[id]||[]}});
 }
 if(method==='POST')return reply(409,{});
 const group=u.pathname.match(/collectionGroups\\/([^/]+)\\/indexes/)[1];
 const file=JSON.parse(fs.readFileSync('docs/qr-firestore-indexes.json','utf8'));
 return reply(200,{indexes:file.indexes.filter(i=>i.collectionGroup===group).map(i=>({...i,state:'READY'}))});
};`;
function run(state){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fi-')),stateFile=path.join(dir,'state.json'),preload=path.join(dir,'stub.mjs');
 fs.writeFileSync(stateFile,JSON.stringify({calls:[],patches:{},queryStatus:200,...state}));fs.writeFileSync(preload,stub);
 const r=spawnSync(process.execPath,['--import',preload,'scripts/firestore-indexes.mjs','docs/qr-firestore-indexes.json'],
  {encoding:'utf8',env:{...process.env,FIRESTORE_ACCESS_TOKEN:'test',STUB_STATE:stateFile}});
 return {...r,state:JSON.parse(fs.readFileSync(stateFile,'utf8'))};
}
const cg={queryScope:'COLLECTION_GROUP',fields:[{fieldPath:'__name__',order:'ASCENDING'}]};

test('adds the COLLECTION_GROUP __name__ overrides additively and keeps existing field indexes',()=>{
 const kept={queryScope:'COLLECTION',fields:[{fieldPath:'__name__',order:'DESCENDING'}],state:'READY'};
 const r=run({fields:{'qrScanEvents.__name__':[kept]}});
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(r.state.patches['qrScanEvents.__name__'].indexConfig.indexes,[{queryScope:'COLLECTION',fields:kept.fields},cg]);
 assert.deepEqual(r.state.patches['qrRateLimits.__name__'].indexConfig.indexes,[cg]);
 assert.ok(r.state.calls.every(c=>!c.startsWith('DELETE')));
 assert.ok(r.state.calls.some(c=>c.startsWith('PATCH ')&&c.endsWith('?updateMask=indexConfig')));
 assert.match(r.stdout,/All 5 indexes are READY\./);
 assert.match(r.stdout,/query {5}qrScanEvents collection group ordered by __name__: OK/);
 assert.match(r.stdout,/query {5}qrRateLimits collection group ordered by __name__: OK/);
});

test('an existing override is reported and not patched again',()=>{
 const r=run({fields:{'qrScanEvents.__name__':[{...cg,state:'READY'}],'qrRateLimits.__name__':[{...cg,state:'READY'}]}});
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(r.state.patches,{});
 assert.match(r.stdout,/exists {4}qrScanEvents\.__name__ \(COLLECTION_GROUP:ASCENDING\)/);
});

test('an index-only principal reports the read probe as not run without failing',()=>{
 const r=run({fields:{},queryStatus:403});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/not run, principal has no read access \(HTTP 403\)/);
});

test('a failing document-name query fails the run',()=>{
 const r=run({fields:{},queryStatus:400});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/HTTP 400/);
});
