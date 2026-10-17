const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {executeAuthority,principalKey}=loadTs('src/lib/access/authority.ts',{'server-only':{}});
const policy=loadTs('src/lib/access/policy.ts');
const owner={provider:'opsfly',organizationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',subject:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
const admin={provider:'firebase',subject:'admin'},reader={provider:'firebase',subject:'reader'};
const ownerKey=principalKey(owner),adminKey=principalKey(admin),readerKey=principalKey(reader);

// A saved policy as production holds it after the audited migration: only orderfly.customer_score.
const migratedPolicy=()=>({
  principals:[{id:ownerKey,active:true,name:'Owner'},{id:adminKey,active:true},{id:readerKey,active:true}],
  companies:[{id:'esmeralda',active:true,locationIds:['l1','l2'],orderflyBrandIds:['brand'],opsflyOrganizationId:null}],
  roles:[
    {id:'platform-owner',name:'Platform superuser',companyId:null,kind:'superuser',permissions:[],active:true},
    {id:'manager',name:'Leder',companyId:'esmeralda',kind:'company_admin',active:true,permissions:['platform.roles:view','platform.roles:create','platform.roles:edit','orderfly.customer_score:view','orderfly.customer_score:edit','orderfly.orders:view']},
    {id:'score',name:'Kundescore',companyId:'esmeralda',kind:'company_user',active:true,permissions:['orderfly.customer_score:view']},
  ],
  memberships:[
    {id:'platform-owner',principalId:ownerKey,companyId:null,locationIds:null,roleIds:['platform-owner'],active:true},
    {id:'admin',principalId:adminKey,companyId:'esmeralda',locationIds:null,roleIds:['manager'],active:true},
    {id:'reader',principalId:readerKey,companyId:'esmeralda',locationIds:null,roleIds:['score'],active:true},
  ],
});
function fixture(saved=migratedPolicy()){
  const records=new Map([['platformAdminControl/access-v1',saved]]);let queue=Promise.resolve();
  const db={collection:name=>({doc:id=>({path:name+'/'+id})}),runTransaction:run=>{
    const job=queue.then(async()=>{const staged=new Map(records),tx={get:async ref=>({exists:staged.has(ref.path),data:()=>structuredClone(staged.get(ref.path))}),set:(ref,value)=>staged.set(ref.path,structuredClone(value))};const result=await run(tx);records.clear();for(const row of staged)records.set(...row);return result;});queue=job.catch(()=>{});return job;
  }};
  const call=(identity,command)=>executeAuthority(db,identity,command,owner,async()=>true);
  return {call,stored:()=>records.get('platformAdminControl/access-v1')};
}

test('the catalogue offers the new structure and no legacy feature or alias',()=>{
  assert.ok(!policy.PERMISSIONS.some(p=>p.startsWith('orderfly.loyalty:')));
  for(const action of ['view','create','edit','delete'])assert.ok(policy.PERMISSIONS.includes(`orderfly.customer_score:${action}`));
  for(const action of ['overview','counter','redeem','correct','settings','members','log'])assert.ok(policy.PERMISSIONS.includes(`orderfly.stamp_cards:${action}`));
  assert.equal(policy.LEGACY_FEATURES,undefined);assert.equal(policy.normalizePermission,undefined);
});

test('a migrated policy is valid and grants exactly the customer-score permissions',async()=>{
  assert.ok(policy.policySchema.safeParse(migratedPolicy()).success);
  const check=permission=>policy.authorize(migratedPolicy(),{principalId:readerKey,companyId:'esmeralda',locationIds:null,permission}).allowed;
  assert.equal(check('orderfly.customer_score:view'),true);
  assert.equal(check('orderfly.customer_score:edit'),false);
  assert.equal(check('orderfly.stamp_cards:overview'),false);
  assert.equal(check('orderfly.loyalty:view'),false);
  assert.deepEqual((await fixture().call(reader,{action:'session'})).permissions,['orderfly.customer_score:view']);
});

test('the legacy name is no longer accepted in a stored policy or a role change',async()=>{
  const legacy=migratedPolicy();legacy.roles[2].permissions=['orderfly.loyalty:view'];
  assert.equal(policy.policySchema.safeParse(legacy).success,false);
  const f=fixture(),list=await f.call(admin,{action:'list'}),score=list.roles.find(r=>r.id==='score');
  await assert.rejects(f.call(admin,{action:'change',kind:'roles',id:'score',revision:list.revision,requestId:crypto.randomUUID(),
    value:{...score,permissions:['orderfly.loyalty:view']}}),/invalid_role/);
  assert.deepEqual(f.stored().roles.find(r=>r.id==='score').permissions,['orderfly.customer_score:view']);
});

test('the one-time migration command is gone',async()=>{
  const f=fixture(),revision=(await f.call(owner,{action:'list'})).revision;
  for(const dryRun of [true,false])
    await assert.rejects(f.call(owner,{action:'migratePermissions',dryRun,requestId:crypto.randomUUID(),revision}),{name:'ZodError'});
});
