const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const filename=path.resolve('src/lib/access/policy.ts');
const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {authorize,authorizeMembershipChange,authorizeRoleChange}=mod.exports;
const fixture=()=>({
 principals:[{id:'owner',active:true},{id:'admin',active:true},{id:'worker',active:true}],
 companies:[{id:'a',active:true,locationIds:['a1','a2']},{id:'b',active:true,locationIds:['b1']}],
 roles:[
  {id:'super',name:'Platform',companyId:null,kind:'superuser',permissions:[],active:true},
  {id:'manager',name:'Manager',companyId:'a',kind:'company_admin',permissions:['platform.members:create','platform.members:edit','platform.members:delete','platform.roles:create','platform.roles:edit','platform.roles:delete','opsfly.schedule:view'],active:true},
  {id:'viewer',name:'Viewer',companyId:'a',kind:'company_user',permissions:['opsfly.schedule:view'],active:true},
 ],
 memberships:[
  {id:'owner-m',principalId:'owner',companyId:null,locationIds:null,roleIds:['super'],active:true},
  {id:'admin-m',principalId:'admin',companyId:'a',locationIds:null,roleIds:['manager'],active:true},
  {id:'worker-m',principalId:'worker',companyId:'a',locationIds:['a1'],roleIds:['viewer'],active:true},
 ],
});
const query=(overrides={})=>({principalId:'worker',companyId:'a',locationIds:['a1'],permission:'opsfly.schedule:view',...overrides});
test('freemium needs no subscription but still requires explicit permission',()=>{
 assert.equal(authorize(fixture(),query()).allowed,true);
 assert.equal(authorize(fixture(),query({permission:'opsfly.schedule:edit'})).allowed,false);
 assert.equal(authorize(fixture(),query({permission:'orderfly.orders:view'})).allowed,false);
});
test('company, location and company-wide boundaries',()=>{
 for(const patch of [{companyId:'b',locationIds:['b1']},{locationIds:['a2']},{locationIds:null},{locationIds:[]},{locationIds:['b1']},{companyId:null,locationIds:null}])
  assert.equal(authorize(fixture(),query(patch)).allowed,false);
});
test('revoking identity, membership, role or company immediately denies',()=>{
 for(const [kind,id] of [['principals','worker'],['memberships','worker-m'],['roles','viewer'],['companies','a']]){
  const s=fixture();s[kind].find(x=>x.id===id).active=false;assert.equal(authorize(s,query()).allowed,false);
 }
});
test('no role-name magic, unknown permissions and malformed policy deny',()=>{
 const s=fixture();s.roles[2].name='Superuser';assert.equal(authorize(s,query({permission:'opsfly.schedule:edit'})).allowed,false);
 assert.equal(authorize(s,query({principalId:'owner',permission:'invented:grant'})).allowed,false);
 s.roles.push(s.roles[0]);assert.equal(authorize(s,query({principalId:'owner'})).allowed,false);
});
test('platform superuser is explicit and cannot access an invalid tenant',()=>{
 assert.equal(authorize(fixture(),query({principalId:'owner',companyId:'b',locationIds:['b1']})).allowed,true);
 assert.equal(authorize(fixture(),query({principalId:'owner',companyId:'missing'})).allowed,false);
});
test('roles belonging to another company cannot be attached',()=>{
 const s=fixture();s.memberships[2].companyId='b';s.memberships[2].locationIds=['b1'];
 assert.equal(authorize(s,query({companyId:'b',locationIds:['b1']})).allowed,false);
});
test('company admin can grant a permitted membership',()=>{
 const s=fixture(),old=s.memberships[2];
 assert.equal(authorizeMembershipChange(s,'admin',old,{...old,locationIds:['a1','a2']}).allowed,true);
});
test('location-limited admin cannot broaden scope',()=>{
 const s=fixture();s.memberships[1].locationIds=['a1'];const old=s.memberships[2];
 assert.equal(authorizeMembershipChange(s,'admin',old,{...old,locationIds:null}).allowed,false);
});
test('company admin cannot assign a superuser or excessive permission',()=>{
 const s=fixture();
 assert.equal(authorizeMembershipChange(s,'admin',null,{id:'bad',principalId:'worker',companyId:null,locationIds:null,roleIds:['super'],active:true}).allowed,false);
 s.roles[2].permissions.push('opsfly.payroll:approve');const old=s.memberships[2];
 assert.equal(authorizeMembershipChange(s,'admin',old,{...old,active:false}).allowed,false);
});
test('last superuser membership and role cannot be deactivated',()=>{
 const s=fixture();
 assert.equal(authorizeMembershipChange(s,'owner',s.memberships[0],{...s.memberships[0],active:false}).reason,'last_superuser');
 assert.equal(authorizeRoleChange(s,'owner',s.roles[0],{...s.roles[0],active:false}).reason,'last_superuser');
});
test('referenced role cannot be deleted; permitted role can be deactivated',()=>{
 const s=fixture();
 assert.equal(authorizeRoleChange(s,'admin',s.roles[2],null).reason,'role_in_use');
 assert.equal(authorizeRoleChange(s,'admin',s.roles[2],{...s.roles[2],active:false}).allowed,true);
});
test('editing a role cannot grant additional powers to its existing assignees',()=>{
 const s=fixture();assert.equal(authorizeRoleChange(s,'admin',s.roles[2],{...s.roles[2],permissions:['opsfly.payroll:approve']}).allowed,false);
 s.memberships[1].locationIds=['a1'];
 assert.equal(authorizeRoleChange(s,'admin',s.roles[2],{...s.roles[2],name:'Renamed'}).allowed,false);
});
test('stale records, ID reuse and principal reassignment deny',()=>{
 const s=fixture(),old=s.memberships[2];
 assert.equal(authorizeMembershipChange(s,'owner',{...old,active:false},null).reason,'stale_membership');
 assert.equal(authorizeMembershipChange(s,'owner',old,{...old,principalId:'admin'}).reason,'immutable_identity');
 assert.equal(authorizeMembershipChange(s,'owner',null,old).reason,'immutable_identity');
});
