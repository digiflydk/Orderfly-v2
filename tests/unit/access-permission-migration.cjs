const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {executeAuthority,principalKey}=loadTs('src/lib/access/authority.ts',{'server-only':{}});
const policy=loadTs('src/lib/access/policy.ts');
const owner={provider:'opsfly',organizationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',subject:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
const admin={provider:'firebase',subject:'admin'},reader={provider:'firebase',subject:'reader'};
const ownerKey=principalKey(owner),adminKey=principalKey(admin),readerKey=principalKey(reader);

// A saved policy as production holds it before release: legacy orderfly.loyalty grants.
const legacyPolicy=()=>({
  principals:[{id:ownerKey,active:true,name:'Owner'},{id:adminKey,active:true},{id:readerKey,active:true}],
  companies:[{id:'esmeralda',active:true,locationIds:['l1','l2'],orderflyBrandIds:['brand'],opsflyOrganizationId:null}],
  roles:[
    {id:'platform-owner',name:'Platform superuser',companyId:null,kind:'superuser',permissions:[],active:true},
    {id:'manager',name:'Leder',companyId:'esmeralda',kind:'company_admin',active:true,permissions:['platform.roles:view','platform.roles:create','platform.roles:edit','orderfly.loyalty:view','orderfly.loyalty:edit','orderfly.orders:view']},
    {id:'score',name:'Kundescore',companyId:'esmeralda',kind:'company_user',active:true,permissions:['orderfly.loyalty:view']},
    {id:'orders',name:'Ordrer',companyId:'esmeralda',kind:'company_user',active:true,permissions:['orderfly.orders:view']},
  ],
  memberships:[
    {id:'platform-owner',principalId:ownerKey,companyId:null,locationIds:null,roleIds:['platform-owner'],active:true},
    {id:'admin',principalId:adminKey,companyId:'esmeralda',locationIds:null,roleIds:['manager'],active:true},
    {id:'reader',principalId:readerKey,companyId:'esmeralda',locationIds:null,roleIds:['score'],active:true},
  ],
});
function fixture(saved=legacyPolicy()){
  const records=new Map([['platformAdminControl/access-v1',saved]]);let queue=Promise.resolve();
  const db={collection:name=>({doc:id=>({path:name+'/'+id})}),runTransaction:run=>{
    const job=queue.then(async()=>{const staged=new Map(records),tx={get:async ref=>({exists:staged.has(ref.path),data:()=>structuredClone(staged.get(ref.path))}),set:(ref,value)=>staged.set(ref.path,structuredClone(value))};const result=await run(tx);records.clear();for(const row of staged)records.set(...row);return result;});queue=job.catch(()=>{});return job;
  }};
  const call=(identity,command)=>executeAuthority(db,identity,command,owner,async()=>true);
  const stored=()=>records.get('platformAdminControl/access-v1');
  const audits=()=>[...records].filter(([path])=>path.startsWith('platformAdminAudit/')).map(([,value])=>value);
  const migrate=async(identity=owner,dryRun=false,requestId=crypto.randomUUID())=>call(identity,{action:'migratePermissions',dryRun,requestId,revision:(await call(owner,{action:'list'})).revision});
  return {call,stored,audits,migrate};
}
const legacyValues=value=>JSON.stringify(value).match(/orderfly\.loyalty:/g)?.length||0;

test('the catalogue offers the new structure and not the legacy feature',()=>{
  assert.ok(!policy.PERMISSIONS.some(p=>p.startsWith('orderfly.loyalty:')));
  for(const action of ['view','create','edit','delete'])assert.ok(policy.PERMISSIONS.includes(`orderfly.customer_score:${action}`));
  for(const action of ['overview','counter','redeem','correct','settings','members','log'])assert.ok(policy.PERMISSIONS.includes(`orderfly.stamp_cards:${action}`));
  assert.equal(policy.normalizePermission('orderfly.loyalty:edit'),'orderfly.customer_score:edit');
  assert.equal(policy.normalizePermission('orderfly.orders:view'),'orderfly.orders:view');
  assert.equal(policy.normalizePermission('orderfly.loyalty:view:x'),'orderfly.loyalty:view:x');
});

test('a saved legacy policy stays valid and grants exactly the renamed permissions',async()=>{
  const parsed=policy.policySchema.safeParse(legacyPolicy());assert.ok(parsed.success);
  assert.deepEqual(parsed.data.roles.find(r=>r.id==='score').permissions,['orderfly.customer_score:view']);
  const check=permission=>policy.authorize(legacyPolicy(),{principalId:readerKey,companyId:'esmeralda',locationIds:null,permission}).allowed;
  assert.equal(check('orderfly.customer_score:view'),true);
  assert.equal(check('orderfly.customer_score:edit'),false);
  // The new stamp-card overview is a separate decision, never inherited from the old score grant.
  assert.equal(check('orderfly.stamp_cards:overview'),false);
  const f=fixture(),session=await f.call(reader,{action:'session'});
  assert.deepEqual(session.permissions,['orderfly.customer_score:view']);
  const list=await f.call(owner,{action:'list'});
  assert.equal(legacyValues(list.roles),0);
});

test('legacy names are rejected for new decisions and unknown legacy actions stay invalid',()=>{
  assert.equal(policy.authorize(legacyPolicy(),{principalId:readerKey,companyId:'esmeralda',locationIds:null,permission:'orderfly.loyalty:view'}).allowed,false);
  const broken=legacyPolicy();broken.roles[2].permissions=['orderfly.loyalty:redeem'];
  assert.equal(policy.policySchema.safeParse(broken).success,false);
  const duplicate=legacyPolicy();duplicate.roles[2].permissions=['orderfly.loyalty:view','orderfly.customer_score:view'];
  assert.equal(policy.policySchema.safeParse(duplicate).success,false);
});

test('dry run reports every legacy role without writing',async()=>{
  const f=fixture(),before=structuredClone(f.stored());
  const report=await f.migrate(owner,true);
  assert.equal(report.dryRun,true);assert.equal(report.migrated,2);
  assert.deepEqual(report.roles,[
    {id:'manager',permissions:[{from:'orderfly.loyalty:view',to:'orderfly.customer_score:view'},{from:'orderfly.loyalty:edit',to:'orderfly.customer_score:edit'}]},
    {id:'score',permissions:[{from:'orderfly.loyalty:view',to:'orderfly.customer_score:view'}]},
  ]);
  assert.deepEqual(f.stored(),before);assert.equal(f.audits().length,0);
});

test('migration rewrites roles 1:1, audits, keeps the revision and is idempotent',async()=>{
  const f=fixture(),revision=(await f.call(owner,{action:'list'})).revision,requestId=crypto.randomUUID();
  const report=await f.call(owner,{action:'migratePermissions',dryRun:false,requestId,revision});
  assert.equal(report.migrated,2);assert.equal(report.revision,revision);
  assert.equal(legacyValues(f.stored()),0);
  assert.deepEqual(f.stored().roles.find(r=>r.id==='manager').permissions,['platform.roles:view','platform.roles:create','platform.roles:edit','orderfly.customer_score:view','orderfly.customer_score:edit','orderfly.orders:view']);
  assert.deepEqual(f.stored().roles.find(r=>r.id==='orders').permissions,['orderfly.orders:view']);
  assert.equal(f.audits().length,1);assert.equal(f.audits()[0].action,'access.migratePermissions');assert.equal(f.audits()[0].actorId,ownerKey);
  assert.deepEqual(f.audits()[0].roles.map(r=>r.id),['manager','score']);
  // Exact retry and a later run are both no-ops.
  assert.equal((await f.call(owner,{action:'migratePermissions',dryRun:false,requestId,revision})).migrated,0);
  assert.equal((await f.migrate()).migrated,0);assert.equal(f.audits().length,1);
  assert.equal((await f.call(reader,{action:'session'})).permissions.join(),'orderfly.customer_score:view');
});

test('migration requires a superuser, the current revision and a unique request',async()=>{
  const f=fixture();
  await assert.rejects(f.migrate(admin),/platform_access_required/);
  await assert.rejects(f.migrate(admin,true),/platform_access_required/);
  await assert.rejects(f.call(owner,{action:'migratePermissions',dryRun:false,requestId:crypto.randomUUID(),revision:'0'.repeat(64)}),/record_changed/);
  const requestId=crypto.randomUUID();await f.migrate(owner,false,requestId);
  // A dry run is a read: it neither consumes nor checks a request identifier.
  assert.equal((await f.call(owner,{action:'migratePermissions',dryRun:true,requestId,revision:'0'.repeat(64)})).migrated,0);
  await assert.rejects(f.call(owner,{action:'migratePermissions',dryRun:false,requestId,revision:'1'.repeat(64)}),/request_conflict/);
  assert.equal(legacyValues(f.stored()),0);
});

test('editing a legacy role persists the new names without widening delegation',async()=>{
  const f=fixture(),list=await f.call(admin,{action:'list'});
  const score=list.roles.find(r=>r.id==='score');
  assert.deepEqual(score.permissions,['orderfly.customer_score:view']);
  await f.call(admin,{action:'change',kind:'roles',id:'score',revision:list.revision,requestId:crypto.randomUUID(),value:{...score,name:'Kundescore læser'}});
  assert.equal(legacyValues(f.stored()),0);
  // The admin held only view+edit through the legacy grant; delete is still not delegable.
  const next=await f.call(admin,{action:'list'});
  await assert.rejects(f.call(admin,{action:'change',kind:'roles',id:'score',revision:next.revision,requestId:crypto.randomUUID(),
    value:{...score,permissions:['orderfly.customer_score:view','orderfly.customer_score:delete']}}),/cannot_delegate_permission/);
  await assert.rejects(f.call(admin,{action:'change',kind:'roles',id:'score',revision:next.revision,requestId:crypto.randomUUID(),
    value:{...score,permissions:['orderfly.stamp_cards:overview']}}),/cannot_delegate_permission/);
});
