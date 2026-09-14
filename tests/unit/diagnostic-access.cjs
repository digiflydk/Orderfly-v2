const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const root='src/app/api/';
const files=['debug','diag','developer','env'].flatMap(folder=>fs.readdirSync(root+folder,{recursive:true}).filter(p=>p.endsWith('route.ts')).map(p=>root+folder+'/'+p));
for(const file of files)test(`diagnostic denies before data access: ${file}`,async()=>{
 const source=fs.readFileSync(file,'utf8');
 if(!source.includes('requireSuperadminApi'))return; // Synchronous disabled endpoints have no business operations.
 let io=0,checks=0;
 const forbidden=new Proxy({}, {get:()=>()=>{io++;throw Error('Business I/O before authorization');}});
 const module={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>name==='@/lib/auth/superadmin-api'?{requireSuperadminApi:async()=>{checks++;return Response.json({error:'Forbidden'},{status:403});}}:name==='server-only'?{}:name==='next/server'?require('next/server'):forbidden,module,module.exports);
 for(const method of ['GET','POST','PUT','DELETE','PATCH'])if(typeof module.exports[method]==='function'){
  const response=await module.exports[method](new Request('https://fixture.test/api/debug?brandSlug=foreign',{method,headers:{'x-role':'superadmin','x-debug-token':'forged'}}),{params:Promise.resolve({})});
  assert.equal(response.status,403,method);
 }
 assert.ok(checks>0);assert.equal(io,0);
});
