const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { loadTs } = require('../helpers/load-ts.cjs');
class AuthorityError extends Error { constructor(code, status=403) { super(code); this.status=status; } }
const command = (extra={}) => ({brandId:'b',locationId:'l',settings:{preorderMinutes:30,warningMinutes:5,overdueMinutes:5,sleepWhenClosed:true},expectedRevision:0,requestId:randomUUID(),...extra});
function fixture(options={}) {
 const rows=new Map([['locations/l',{brandId:'b',...options.location}]]), writes=[],calls=[];
 let revoked=false,serial=Promise.resolve();
 const db={collection:n=>({doc:id=>({path:`${n}/${id}`})}),runTransaction:run=>{
  const task=serial.then(async()=>{const staged=[],tx={get:async ref=>{assert.equal(staged.length,0,'reads precede writes');return {data:()=>structuredClone(rows.get(ref.path))};},update:(ref,value)=>staged.push(['update',ref.path,value]),create:(ref,value)=>{assert.equal(rows.has(ref.path),false);staged.push(['create',ref.path,value]);}};
   const result=await run(tx); if(options.failCommit)throw Error('private database failure');
   for(const [kind,path,value]of staged)rows.set(path,kind==='update'?{...rows.get(path),...value}:value);writes.push(...staged);return result;
  });serial=task.catch(()=>{});return task;
 }};
 const check=async()=>{if(revoked||options.denied)throw new AuthorityError('forbidden');};
 const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db,getAdminFieldValue:()=>({serverTimestamp:()=>'SERVER_TIME'})},'@/lib/access/authority':{AuthorityError,principalKey:()=> 'employee'},
 '@/lib/orders/kds-scope':{resolveKdsScope:async()=>{await check();return {identity:{subject:'employee'},locations:options.foreignScope?[]:[{brandId:'b',locationId:'l'}]};}},
 '@/lib/access/scoped-data':{authorizeTransaction:async(tx,identity,scope,permission,kind)=>{calls.push({source:'kds',scope,permission,kind});await check();}},
 '@/lib/terminal-auth/access':{getOrderTerminalActor:async source=>{assert.equal(source,'terminal');return {actorId:'terminal'};},authorizeOrderTerminalTransaction:async(tx,actor,scope)=>{calls.push({source:'terminal',scope});await check();}}};
 // The loader resolves relative imports before alias mocks.
 mocks['./kds-scope']=mocks['@/lib/orders/kds-scope'];
 return {...loadTs('src/lib/orders/kds-settings-server.ts',mocks),rows,writes,calls,revoke:()=>revoked=true};
}
test('settings save atomically with audit, expected revision and idempotent retry under fresh authority',async()=>{
 for(const source of ['kds','terminal']){
  const f=fixture(),cmd=command();assert.deepEqual(await f.saveKdsSettings(cmd,source),{success:true,revision:1});
  assert.deepEqual(f.rows.get('locations/l').kdsSettings,cmd.settings);assert.equal(f.writes.length,2);assert.equal(f.writes[1][2].action,'kds_settings_changed');
  assert.deepEqual(await f.saveKdsSettings(cmd,source),{success:true,revision:1});assert.equal(f.writes.length,2);
  assert.equal(f.calls[0].source,source);if(source==='kds')assert.equal(f.calls[0].permission,'orderfly.orders:edit');
  await assert.rejects(f.saveKdsSettings({...cmd,settings:{...cmd.settings,preorderMinutes:60}},source),e=>e.status===409);
  f.revoke();await assert.rejects(f.saveKdsSettings(cmd,source),e=>e.status===403);
 }
});
test('settings reject invalid, foreign, revoked and conflicting changes without writes',async()=>{
 for(const options of [{denied:true},{foreignScope:true},{location:{brandId:'foreign'}},{location:{kdsSettingsRevision:2}}]){const f=fixture(options);await assert.rejects(f.saveKdsSettings(command(),'kds'));assert.equal(f.writes.length,0);}
 for(const patch of [{settings:{preorderMinutes:-1}},{settings:{warningMinutes:121}},{settings:{overdueMinutes:1.5}},{settings:{sleepWhenClosed:'yes'}},{settings:{extra:true}},{expectedRevision:-1},{requestId:'bad'},{canEdit:true}]){const f=fixture();await assert.rejects(f.saveKdsSettings(command(patch),'kds'),e=>e.status===400);assert.equal(f.writes.length,0);}
 const f=fixture(),results=await Promise.allSettled([f.saveKdsSettings(command(),'kds'),f.saveKdsSettings(command(),'kds')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.writes.length,2);
 const broken=fixture({failCommit:true});await assert.rejects(broken.saveKdsSettings(command(),'kds'));assert.equal(broken.rows.get('locations/l').kdsSettings,undefined);
});
test('settings HTTP routes bind source, reject unsafe requests and sanitize failures',async()=>{
 for(const source of ['kds','terminal']){
  let calls=0,error;class KdsSettingsError extends Error{constructor(status){super('private');this.status=status;}}
  const {POST}=loadTs(`src/app/api/${source}/orders/settings/route.ts`,{'@/lib/access/authority':{AuthorityError},'@/lib/url':{getOrigin:async()=>'https://esmeralda.orderfly.dk'},'@/lib/orders/kds-settings-server':{KdsSettingsError,saveKdsSettings:async(input,kind)=>{calls++;assert.equal(kind,source);if(error)throw error;return {success:true,revision:1};}}});
  const req=(body='{}',headers={},search='')=>new Request(`https://esmeralda.orderfly.dk/api/${source}/orders/settings${search}`,{method:'POST',headers:{origin:'https://esmeralda.orderfly.dk','content-type':'application/json',...headers},body});
  for(const request of [req('{}',{origin:'https://evil.example'}),req('{}',{'sec-fetch-site':'cross-site'}),req('x'.repeat(5000)),req('{bad'),req('{}',{'content-encoding':'gzip'}),req('{}',{},'?brandId=other')])assert.ok([400,403].includes((await POST(request)).status));
  assert.equal(calls,0);assert.equal((await POST(req())).status,200);
  for(const [failure,status]of [[new AuthorityError('private',401),401],[new AuthorityError('private'),403],[new KdsSettingsError(409),409],[Error('private'),503]]){error=failure;const response=await POST(req());assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.text()).includes('private'),false);}
 }
});
