const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const file='src/app/superadmin/loyalty/discount-card/actions.ts';
function load({deny=false,failure=null}={}){
 const calls=[],actor={identity:{provider:'firebase',subject:'admin'},name:'Admin'},db={},data={feature:{version:2}};
 class AuthorityError extends Error{constructor(code){super(code);this.code=code;}}
 const save=kind=>async(database,who,input)=>{calls.push({kind,database,who,input});if(failure)throw new AuthorityError(failure);return {version:2};};
 const service={readDiscountCardAdmin:async(database,who,brand,email)=>{calls.push({kind:'read',database,who,brand,email});return data;},saveDiscountCardFeature:save('feature'),saveDiscountCardGroup:save('group'),saveDiscountCardAssignment:save('assignment')};
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,module:mod,require:id=>{
 if(id==='zod')return require('zod');
 if(id==='next/cache')return {revalidatePath:()=>{}};
 if(id==='@/lib/firebase-admin')return {getAdminDb:()=>db};
 if(id==='@/lib/access/orderfly-session')return {requirePlatformSuperuser:async()=>{if(deny)throw new AuthorityError('forbidden');return actor;}};
 if(id==='@/lib/access/authority')return {AuthorityError};
 if(id==='@/lib/loyalty/discount-card/admin')return service;
 if(id==='@/lib/loyalty/discount-card/invitations')return {inviteDiscountCard:save('invite')};
 throw Error(id);
 },Date,Set});return {api:mod.exports,calls,db,actor,data};
}
for(const action of ['saveDiscountCardFeatureAction','saveDiscountCardGroupAction','saveDiscountCardAssignmentAction','inviteDiscountCardAction','searchDiscountCardCustomersAction'])test(action+' rejects non-superuser before any database service',async()=>{
 const t=load({deny:true}),result=await t.api[action]({brandId:'brand'});
 assert.equal(result.ok,false);assert.equal(result.error,'forbidden');assert.equal(t.calls.length,0);
});
for(const action of ['saveDiscountCardFeatureAction','saveDiscountCardGroupAction','saveDiscountCardAssignmentAction','inviteDiscountCardAction'])test(action+' forwards verified server actor and returns authoritative refreshed state',async()=>{
 const t=load(),input={brandId:'brand',version:1};const result=await t.api[action](input);
 assert.equal(result.ok,true);assert.equal(result.data,t.data);assert.equal(t.calls[0].who.identity,t.actor.identity);assert.equal(t.calls[0].database,t.db);assert.equal(t.calls[0].input,input);assert.equal(t.calls[1].brand,'brand');
});
test('conflict does not read or claim successful save',async()=>{const t=load({failure:'record_changed'}),r=await t.api.saveDiscountCardFeatureAction({brandId:'brand'});assert.equal(r.ok,false);assert.equal(r.error,'record_changed');assert.equal(t.calls.length,1);});
test('customer search remains authenticated and passes bounded exact email',async()=>{const t=load(),r=await t.api.searchDiscountCardCustomersAction('brand',' person@example.com ');assert.equal(r.ok,true);assert.equal(t.calls[0].email,'person@example.com');assert.equal((await t.api.searchDiscountCardCustomersAction('brand','x'.repeat(255))).ok,false);});
test('invalid refresh query is rejected before any mutation',async()=>{const t=load(),r=await t.api.saveDiscountCardFeatureAction({brandId:'brand'},'not an email');assert.equal(r.ok,false);assert.equal(r.error,'invalid_input');assert.equal(t.calls.length,0);});
test('navigation reveals the admin route only to platform superuser',()=>{const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/access/navigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,module:mod});const route='/superadmin/loyalty/discount-card';assert.equal(mod.exports.canNavigate(route,{superuser:true,permissions:[]}),true);assert.equal(mod.exports.canNavigate(route,{superuser:false,permissions:['orderfly.stamp_cards:settings','orderfly.discounts:view']}),false);});
