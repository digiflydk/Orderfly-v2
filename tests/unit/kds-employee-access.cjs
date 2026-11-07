const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const {loadTs}=require('../helpers/load-ts.cjs');
const {canNavigate}=loadTs('src/lib/access/navigation.ts');
class AuthorityError extends Error { constructor(status){super('authority');this.status=status;} }
function fixture({cookie=true,session={superuser:false,permissions:['orderfly.orders:view']},failure}={}){
 let calls=0;const denied=()=>null, terminal=()=>null, employee=()=>null,logout=()=>null;
 const mocks={
  '@/lib/orders/kds-scope':{resolveKdsScope:async()=>({locations:[{brandId:'b1',locationId:'l1',brandName:'Esmeralda',locationName:'Amager'}]})},
  'next/headers':{cookies:async()=>({has:()=>cookie})},
  'next/navigation':{redirect:href=>{throw Object.assign(Error('redirect'),{href});}},
  '@/lib/access/orderfly-session':{orderflySession:async()=>{calls++;if(failure)throw failure;return session;}},
  '@/lib/access/navigation':{canNavigate},'@/lib/access/authority':{AuthorityError},
  '@/app/terminal/orders/terminal-portal':{TerminalPortal:terminal},
  '@/app/merchant/orders/terminal-client':{TerminalClient:employee},
  '@/components/superadmin/access-denied-page':{AccessDeniedPage:denied},
  '@/components/superadmin/logout-button':{LogoutButton:logout},
 };
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync('src/app/kds/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)(name=>mocks[name]||require(name),mod,mod.exports);
 return {run:params=>mod.exports.default({searchParams:Promise.resolve(params||{})}),denied,terminal,employee,logout,calls:()=>calls};
}
test('KDS uses existing order access for employee and superadmin, without name exceptions',async()=>{
 for(const session of [{superuser:true,permissions:[]},{superuser:false,permissions:['orderfly.orders:view']}]){
  const f=fixture({session}),tree=await f.run(),children=[tree.props.logoutControl,tree];
  assert.equal(children[1].type,f.employee);assert.equal(children[1].props.loginHref,'/kds/login');
  assert.equal(children[1].props.fixedScope,undefined);assert.equal(children[1].props.apiBase,'/api/kds/orders');assert.equal(children[1].props.actionApiBase,'/api/merchant/orders');assert.equal(children[1].props.initialLocations[0].brandName,'Esmeralda');
  assert.equal(children[0].type,f.logout);assert.equal(children[0].props.loginHref,'/kds/login');assert.equal(f.calls(),1);
 }
});
test('KDS denies a valid employee without order permission',async()=>{
 const f=fixture({session:{superuser:false,permissions:['orderfly.stamp_cards:counter']}});
 assert.equal((await f.run()).type,f.denied);
});
test('expired employee cookie returns to employee login; never falls back to terminal',async()=>{
 const f=fixture({failure:new AuthorityError(401)});await assert.rejects(f.run(),e=>e.href==='/kds/login');
});
test('permission failure denies and identity outage remains an outage',async()=>{
 const denied=fixture({failure:new AuthorityError(403)});assert.equal((await denied.run()).type,denied.denied);
 const outage=fixture({failure:new AuthorityError(503)});await assert.rejects(outage.run(),e=>e.status===503);
});
test('terminal mode remains separate even with an expired employee cookie',async()=>{
 const f=fixture({failure:new AuthorityError(401)}),tree=await f.run({terminal:'1'});
 assert.equal(tree.type,f.terminal);assert.equal(tree.props.loginHref,'/kds/login/terminal');assert.equal(f.calls(),0);
});
test('no employee cookie preserves existing terminal session reuse and employee login entry',async()=>{
 const f=fixture({cookie:false}),tree=await f.run();assert.equal(tree.type,f.terminal);assert.equal(tree.props.loginHref,'/kds/login');assert.equal(f.calls(),0);
});
