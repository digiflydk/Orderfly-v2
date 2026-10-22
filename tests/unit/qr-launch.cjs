const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
test('a QR-only native viewer can launch Orderfly into the protected QR module',async()=>{
 let grants=0;
 const {checkLaunchAccess}=loadTs('src/lib/access/mpanel-launch.ts',{
  'server-only':{},
  './opsfly-login':{nativeOpsflySession:async()=>({identity:{provider:'opsfly',subject:'native',organizationId:'org'}})},
  './authority':{AuthorityError:class extends Error{},executeAuthority:async(db,identity,command)=>{
   if(command.action==='session')return {superuser:false,permissions:['orderfly.qr_codes:view']};
   assert.equal(command.action,'nativeGrants');assert.equal(command.permission,'orderfly.qr_codes:view');grants++;
   return {grants:[{tenantId:'brandA',locationIds:['locA']}]};
  }},
 });
 const db={collection:name=>({doc:id=>({get:async()=>({exists:true,data:()=>name==='locations'?{brandId:'brandA'}:{status:'active'}})})})};
 assert.equal((await checkLaunchAccess(db,'opaque-fixture')).path,'/superadmin/qr-codes');assert.equal(grants,1);
});
test('QR launch denies a stale cross-brand native location even with a permission name',async()=>{
 const {checkLaunchAccess}=loadTs('src/lib/access/mpanel-launch.ts',{
  'server-only':{},'./opsfly-login':{nativeOpsflySession:async()=>({identity:{provider:'opsfly'}})},
  './authority':{AuthorityError:class extends Error{},executeAuthority:async(db,identity,c)=>c.action==='session'?{superuser:false,permissions:['orderfly.qr_codes:view']}:{grants:[{tenantId:'brandA',locationIds:['foreign']}]}}
 });
 const db={collection:name=>({doc:()=>({get:async()=>({exists:true,data:()=>name==='locations'?{brandId:'brandB'}:{}})})})};
 await assert.rejects(()=>checkLaunchAccess(db,'opaque-fixture'));
});
