const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {PERMISSIONS,policySchema,authorize}=loadTs('src/lib/access/policy.ts');
const {canNavigate,filterNavigation,counterOnly}=loadTs('src/lib/access/navigation.ts');
const actions=['view','create','edit','archive','export','analytics'];
const permission=action=>`orderfly.qr_codes:${action}`;
function policy(grants,locationIds=['a1']) {
 return {principals:[{id:'reader',active:true}],companies:[{id:'a',active:true,locationIds:['a1','a2'],orderflyBrandIds:['brand-a'],opsflyOrganizationId:null},{id:'b',active:true,locationIds:['b1'],orderflyBrandIds:['brand-b'],opsflyOrganizationId:null}],
  roles:[{id:'reader-role',name:'Company admin',companyId:'a',kind:'company_admin',active:true,permissions:grants}],
  memberships:[{id:'reader-membership',principalId:'reader',companyId:'a',locationIds,roleIds:['reader-role'],active:true}]};
}
const access=permissions=>({superuser:false,permissions});
test('QR catalogue registers only the six explicit actions',()=>{
 assert.deepEqual(PERMISSIONS.filter(p=>p.startsWith('orderfly.qr_codes:')),actions.map(permission));
 assert.equal(new Set(PERMISSIONS).size,PERMISSIONS.length);
 assert.equal(policySchema.safeParse(policy(actions.map(permission))).success,true);
 assert.equal(policySchema.safeParse(policy([permission('delete')])).success,false);
});
test('each QR action remains independent, tenant-bound and location-bound',()=>{
 for(const held of actions){
  const saved=policy([permission(held)]), check=(action,companyId='a',locationIds=['a1'])=>authorize(saved,{principalId:'reader',companyId,locationIds,permission:permission(action)}).allowed;
  for(const action of actions)assert.equal(check(action),held===action,`${held} must not grant ${action}`);
  assert.equal(check(held,'a',['a2']),false);assert.equal(check(held,'b',['b1']),false);assert.equal(check(held,'a',null),false);
 }
});
test('company admin name and kind do not implicitly grant QR access',()=>{
 const saved=policy([]),check=action=>authorize(saved,{principalId:'reader',companyId:'a',locationIds:['a1'],permission:permission(action)}).allowed;
 for(const action of actions)assert.equal(check(action),false);
});
test('QR navigation requires view rather than another QR action or generic analytics',()=>{
 for(const permissions of [[],['orderfly.analytics:view'],['orderfly.catalog:view'],...actions.filter(a=>a!=='view').map(a=>[permission(a)])]) {
  for(const href of ['/superadmin/qr-codes','/superadmin/qr-codes/code-1'])assert.equal(canNavigate(href,access(permissions)),false);
 }
 for(const href of ['/superadmin/qr-codes','/superadmin/qr-codes/code-1']){
  assert.equal(canNavigate(href,access([permission('view')])),true);assert.equal(canNavigate(href,{superuser:true,permissions:[]}),true);assert.equal(canNavigate(href,null),false);
 }
 assert.equal(canNavigate('/superadmin/qr-codes-foreign',access([permission('view')])),false);
 assert.deepEqual(filterNavigation([{href:'/superadmin/qr-codes'},{href:'/superadmin/customers'}],access([permission('view')])),[{href:'/superadmin/qr-codes'}]);
});
test('QR viewer leaves counter-only mode without changing stamp-card grants',()=>{
 const staff=access(['orderfly.stamp_cards:counter']);assert.equal(counterOnly(staff),true);
 const qr=access([...staff.permissions,permission('view')]);assert.equal(counterOnly(qr),false);assert.equal(canNavigate('/merchant/stamp-card',qr),true);assert.equal(canNavigate('/superadmin/qr-codes',qr),true);
 assert.equal(canNavigate('/superadmin/loyalty/stamp-card',qr),false);
});
