const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {executeAuthority,principalKey}=loadTs('src/lib/access/authority.ts',{'server-only':{}});
const owner={provider:'opsfly',organizationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',subject:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
const admin={provider:'firebase',subject:'admin'},worker={provider:'firebase',subject:'worker'};
function fixture(){
 const records=new Map();let queue=Promise.resolve();
 const db={collection:name=>({doc:id=>({path:name+'/'+id})}),runTransaction:run=>{
  const job=queue.then(async()=>{const staged=new Map(records),tx={get:async ref=>({exists:staged.has(ref.path),data:()=>structuredClone(staged.get(ref.path))}),set:(ref,value)=>staged.set(ref.path,structuredClone(value))};const result=await run(tx);records.clear();for(const row of staged)records.set(...row);return result;});queue=job.catch(()=>{});return job;
 }};
 const call=(identity,command)=>executeAuthority(db,identity,command,owner,async native=>native.subject!=='missing');
 const list=(identity=owner)=>call(identity,{action:'list'});
 const change=async(kind,value,id=value?.id,identity=owner)=>call(identity,{action:'change',kind,id,value,requestId:crypto.randomUUID(),revision:(await list(identity)).revision});
 return {records,call,list,change};
}
async function initialized(){const f=fixture();await f.call(owner,{action:'initialize',requestId:crypto.randomUUID()});return f;}
async function companyFixture(){const f=await initialized();
 await f.change('companies',{id:'a',active:true,locationIds:['a1','a2']});
 await f.change('companies',{id:'b',active:true,locationIds:['b1']});
 for(const identity of [admin,worker])await f.change('principals',{id:principalKey(identity),active:true});
 await f.change('roles',{id:'manager',name:'Company admin',companyId:'a',kind:'company_admin',active:true,permissions:['platform.members:view','platform.members:create','platform.members:edit','platform.roles:view','platform.roles:create','platform.roles:edit','opsfly.schedule:view']});
 await f.change('roles',{id:'reader',name:'Company reader',companyId:'a',kind:'company_user',active:true,permissions:['opsfly.schedule:view']});
 await f.change('memberships',{id:'admin',principalId:principalKey(admin),companyId:'a',locationIds:null,roleIds:['manager'],active:true});
 return f;
}
test('initialization is explicit, owner-only and cannot reset a populated authority',async()=>{
 const f=fixture();await assert.rejects(f.list(),/not_initialized/);
 await assert.rejects(f.call(admin,{action:'initialize',requestId:crypto.randomUUID()}),/forbidden/);assert.equal(f.records.size,0);
 await f.call(owner,{action:'initialize',requestId:crypto.randomUUID()});
 await assert.rejects(f.call(owner,{action:'initialize',requestId:crypto.randomUUID()}),/already_initialized/);
});
test('native identity namespaces and Opsfly organizations cannot collide',()=>{
 const keys=[owner,{...owner,organizationId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},{provider:'firebase',subject:owner.subject}].map(principalKey);
 assert.equal(new Set(keys).size,3);
});
test('company administration uses current stored grants and filters foreign records',async()=>{
 const f=await companyFixture(),catalog=await f.list(admin);
 assert.deepEqual(catalog.companies.map(c=>c.id),['a']);assert.equal(catalog.superuser,false);
 assert.equal(catalog.principals.some(p=>p.id===principalKey(owner)),false);
 await f.change('memberships',{id:'worker',principalId:principalKey(worker),companyId:'a',locationIds:['a1'],roleIds:['reader'],active:true},'worker',admin);
 assert.equal((await f.call(worker,{action:'check',companyId:'a',locationIds:['a1'],permission:'opsfly.schedule:view'})).allowed,true);
 assert.equal((await f.call(worker,{action:'check',companyId:'a',locationIds:['a2'],permission:'opsfly.schedule:view'})).allowed,false);
 assert.equal((await f.call(worker,{action:'check',companyId:'b',locationIds:['b1'],permission:'opsfly.schedule:view'})).allowed,false);
});
test('company administrator cannot alter global identity, companies or grant excessive roles',async()=>{
 const f=await companyFixture();
 await assert.rejects(f.change('principals',{id:principalKey(owner),active:false},principalKey(owner),admin),/platform_access_required/);
 await assert.rejects(f.change('companies',{id:'b',active:false,locationIds:['b1']},'b',admin),/platform_access_required/);
 await assert.rejects(f.change('roles',{id:'bad',name:'Bad',kind:'company_user',companyId:'a',active:true,permissions:['opsfly.payroll:approve']},'bad',admin),/cannot_delegate_permission/);
});
test('competing changes cannot overwrite another saved revision',async()=>{
 const f=await initialized(),revision=(await f.list()).revision;
 const results=await Promise.allSettled(['a','b'].map(id=>f.call(owner,{action:'change',kind:'companies',id,value:{id,active:true,locationIds:[]},revision,requestId:crypto.randomUUID()})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.match(results.find(r=>r.status==='rejected').reason.message,/record_changed/);
 assert.equal((await f.list()).companies.length,1);
});
test('last superuser global identity cannot be disabled or deleted',async()=>{
 const f=await initialized(),id=principalKey(owner);
 await assert.rejects(f.change('principals',{id,active:false}),/last_superuser/);
 await assert.rejects(f.change('principals',null,id),/invalid_policy/);
 assert.equal((await f.list()).superuser,true);
});
test('revocation blocks reads and replay of an earlier successful mutation',async()=>{
 const f=await companyFixture();
 const command={action:'change',kind:'roles',id:'reader',value:{id:'reader',name:'Renamed reader',companyId:'a',kind:'company_user',active:true,permissions:['opsfly.schedule:view']},revision:(await f.list(admin)).revision,requestId:crypto.randomUUID()};
 await f.call(admin,command);await f.call(admin,command);
 await f.change('principals',{id:principalKey(admin),active:false});
 await assert.rejects(f.list(admin),/principal_inactive/);await assert.rejects(f.call(admin,command),/principal_inactive/);
});
test('browser actor injection and unknown actions cannot reach writes',async()=>{
 const f=await initialized(),size=f.records.size;
 await assert.rejects(f.call(owner,{action:'list',actorId:principalKey(owner)}));
 await assert.rejects(f.call(owner,{action:'grant-all'}));assert.equal(f.records.size,size);
 assert.equal((await f.call(owner,{action:'check',companyId:null,locationIds:null,permission:'unknown:grant'})).allowed,false);
});

test('machine route authenticates before database access and never accepts browser actor extensions',async()=>{
 const envNames=['MPANEL_PLATFORM_ADMIN_ENABLED','MPANEL_PLATFORM_ADMIN_SECRET','MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID','MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID'];
 const previous=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));
 try {
  process.env.MPANEL_PLATFORM_ADMIN_ENABLED='true';process.env.MPANEL_PLATFORM_ADMIN_SECRET='s'.repeat(48);
  process.env.MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID=owner.subject;process.env.MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID=owner.organizationId;
  let dbCalls=0;
  const route=loadTs('src/app/api/integrations/mpanel/access/route.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>{dbCalls++;throw Error('Fixture database');}}});
  const request=(body,secret)=>new Request('https://orderfly.dk/api/integrations/mpanel/access',{method:'POST',headers:secret?{'x-mpanel-platform-secret':secret}:{},body:JSON.stringify(body)});
  const body={actorId:owner.subject,organizationId:owner.organizationId,command:{action:'list'}};
  assert.equal((await route.POST(request(body))).status,401);assert.equal(dbCalls,0);
  assert.equal((await route.POST(request({...body,role:'superuser'},'s'.repeat(48)))).status,400);assert.equal(dbCalls,0);
  assert.equal((await route.POST(request({...body,command:{action:'list',principalId:principalKey(owner)}},'s'.repeat(48)))).status,400);assert.equal(dbCalls,0);
  assert.equal((await route.POST(request(body,'s'.repeat(48)))).status,503);assert.equal(dbCalls,1);
 }finally{for(const k of envNames)if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
});

test('native tenant mapping cannot be substituted and duplicates cannot be saved',async()=>{
 const f=await companyFixture();
 await f.change('companies',{id:'a',active:true,locationIds:['a1','a2'],orderflyBrandIds:['brand-a'],opsflyOrganizationId:owner.organizationId});
 await f.change('companies',{id:'b',active:true,locationIds:['b1'],orderflyBrandIds:['brand-b'],opsflyOrganizationId:null});
 await assert.rejects(f.change('companies',{id:'b',active:true,locationIds:['b1'],orderflyBrandIds:['brand-a'],opsflyOrganizationId:null}),/invalid_policy/);
 const check=(changes={})=>f.call(admin,{action:'checkNative',product:'opsfly',tenantId:owner.organizationId,locationIds:['a1'],permission:'opsfly.schedule:view',...changes});
 assert.equal((await check()).allowed,true);
 assert.equal((await check({tenantId:'unlinked'})).allowed,false);
 assert.equal((await check({product:'orderfly',tenantId:'brand-a'})).allowed,false);
 assert.equal((await check({locationIds:['b1']})).allowed,false);
});

test('Orderfly session verification checks revocation and fails closed for missing or rejected cookies',async()=>{
 let value,seen=[];
 const mod=loadTs('src/lib/access/orderfly-session.ts',{'server-only':{},'next/headers':{cookies:async()=>({get:()=>value?{value}:undefined})},'@/lib/firebase-admin':{getAdminApp:()=>({auth:()=>({verifySessionCookie:async(cookie,revoked)=>{seen.push([cookie,revoked]);if(cookie==='revoked')throw Error('revoked');return {uid:'real-user'};}})})}});
 await assert.rejects(mod.verifiedOrderflyIdentity(),/unauthorized/);assert.equal(seen.length,0);
 value='revoked';await assert.rejects(mod.verifiedOrderflyIdentity(),/unauthorized/);
 value='valid';assert.deepEqual(await mod.verifiedOrderflyIdentity(),{provider:'firebase',subject:'real-user'});
 assert.deepEqual(seen,[['revoked',true],['valid',true]]);
});

test('Orderfly guard rejects missing brands and foreign native locations even after a policy grant',async()=>{
 let brandExists=true,locationBrand='foreign',decision={allowed:true,reason:'granted'};
 const authority=loadTs('src/lib/access/authority.ts',{'server-only':{}});
 const mod=loadTs('src/lib/access/orderfly-session.ts',{'server-only':{},'next/headers':{cookies:async()=>({get:()=>({value:'verified'})})},'@/lib/firebase-admin':{
  getAdminApp:()=>({auth:()=>({verifySessionCookie:async()=>({uid:'user'})})}),
  getAdminDb:()=>({collection:kind=>({doc:()=>({get:async()=>kind==='brands'?{exists:brandExists}:{exists:true,data:()=>({brandId:locationBrand})}})})}),
 },'./authority':{...authority,executeAuthority:async()=>decision}});
 await assert.rejects(mod.requireOrderflyAccess('brand',['location'],'orderfly.orders:view'),/forbidden/);
 locationBrand='brand';assert.equal((await mod.requireOrderflyAccess('brand',['location'],'orderfly.orders:view')).brandId,'brand');
 brandExists=false;await assert.rejects(mod.requireOrderflyAccess('brand',null,'orderfly.orders:view'),/forbidden/);
 brandExists=true;decision={allowed:false,reason:'permission_missing'};await assert.rejects(mod.requireOrderflyAccess('brand',null,'orderfly.orders:view'),/forbidden/);
});


test('enrollment adds a verified existing identity and membership atomically',async()=>{
 const f=await companyFixture();
 const command={action:'enroll',identity:{provider:'firebase',subject:'new-user'},name:'New user',companyId:'a',locationIds:['a1'],roleIds:['reader'],revision:(await f.list(admin)).revision,requestId:crypto.randomUUID()};
 await f.call(admin,command);
 const native={provider:'firebase',subject:'new-user'};
 assert.equal((await f.call(native,{action:'check',companyId:'a',locationIds:['a1'],permission:'opsfly.schedule:view'})).allowed,true);
 const list=await f.list();assert.equal(list.principals.find(p=>p.id===principalKey(native)).name,'New user');
 assert.equal(list.memberships.filter(m=>m.principalId===principalKey(native)).length,1);
 await f.call(admin,command);assert.equal((await f.list()).memberships.filter(m=>m.principalId===principalKey(native)).length,1);
});
test('enrollment rejects missing native accounts, foreign organizations and excessive roles without creating a principal',async()=>{
 const f=await companyFixture(),before=(await f.list()).principals.length;
 const base={action:'enroll',identity:{provider:'firebase',subject:'missing'},name:'Missing user',companyId:'a',locationIds:['a1'],roleIds:['reader'],revision:(await f.list(admin)).revision,requestId:crypto.randomUUID()};
 await assert.rejects(f.call(admin,base),/native_identity_unavailable/);
 await assert.rejects(f.call(admin,{...base,identity:{provider:'opsfly',organizationId:owner.organizationId,subject:owner.subject},requestId:crypto.randomUUID()}),/organization_mismatch/);
 await assert.rejects(f.call(admin,{...base,identity:{provider:'firebase',subject:'new-user'},companyId:null,locationIds:null,roleIds:['platform-owner'],requestId:crypto.randomUUID()}),/platform_access_required/);
 assert.equal((await f.list()).principals.length,before);
});

test('enrollment retry retains create permission and still observes later revocation',async()=>{
 const f=await companyFixture();
 const manager=(await f.list()).roles.find(r=>r.id==='manager');
 await f.change('roles',{...manager,permissions:manager.permissions.filter(p=>p!=='platform.members:edit')});
 const command={action:'enroll',identity:{provider:'firebase',subject:'create-only-target'},name:'Target',companyId:'a',locationIds:['a1'],roleIds:['reader'],revision:(await f.list(admin)).revision,requestId:crypto.randomUUID()};
 await f.call(admin,command);await f.call(admin,command);
 await f.change('roles',{...manager,permissions:manager.permissions.filter(p=>p!=='platform.members:create')});
 await assert.rejects(f.call(admin,command),/administration_scope_missing/);
});

test('session grants contain only the caller active memberships and native grants never become cross-company wildcards',async()=>{
 const f=await companyFixture();
 await f.change('companies',{id:'a',active:true,locationIds:['a1','a2'],opsflyOrganizationId:owner.organizationId,orderflyBrandIds:['brand-a']});
 await f.change('memberships',{id:'worker',principalId:principalKey(worker),companyId:'a',locationIds:['a1'],roleIds:['reader'],active:true});
 const session=await f.call(worker,{action:'session'});assert.equal(session.superuser,false);assert.deepEqual(session.permissions,['opsfly.schedule:view']);
 assert.deepEqual(await f.call(worker,{action:'nativeGrants',product:'opsfly',permission:'opsfly.schedule:view'}),{grants:[{tenantId:owner.organizationId,locationIds:['a1']}]});
 assert.deepEqual(await f.call(worker,{action:'nativeGrants',product:'orderfly',permission:'orderfly.orders:view'}),{grants:[]});
 await assert.rejects(f.call(worker,{action:'nativeGrants',product:'opsfly',permission:'orderfly.orders:view'}),/permission_missing/);
 await f.change('roles',{...(await f.list()).roles.find(r=>r.id==='reader'),active:false});
 assert.deepEqual((await f.call(worker,{action:'session'})).permissions,[]);
 assert.deepEqual(await f.call(worker,{action:'nativeGrants',product:'opsfly',permission:'opsfly.schedule:view'}),{grants:[]});
});
