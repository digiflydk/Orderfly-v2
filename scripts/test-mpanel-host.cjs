// Runs real server Response functions using only the installed TypeScript compiler.
const ts = require('typescript');
const fs = require('node:fs');
const Module = require('node:module');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {mpanelHostResponse} = require('../src/lib/mpanel-host-server.ts');
const {isMpanelHost,resolveLegacyMpanelRedirect,resolveMpanelAliasRedirect} = require('../src/lib/mpanel-host.ts');
const table = require('../mpanel/esmeralda/routes.json');
const manifest = require('../mpanel/esmeralda/manifest.json');
const queries=['','?','?x=%2F&x=%252F&space=a+b&space=a%20b','?next=https%3A%2F%2Fattacker.invalid&empty=&flag','?unicode=%C3%A6%26%3D%23&reserved=%3F%3A%2B'];
(async()=>{
 let count=0;
 for(const route of table.routes) for(const path of route.legacy_paths) for(const suffix of ['', '/']) for(const query of queries) {
  assert.equal(resolveLegacyMpanelRedirect(path+suffix,query),table.origin+route.target_path+query); count++;
 }
 for(const path of ['/','/menu','/bordbooking','/book-bord','/mpanel/unknown','/MPANEL','/%6dpanel','//mpanel']) assert.equal(resolveLegacyMpanelRedirect(path,''),null);
 for(const host of ['esmeraldapizza.dk','mpanel.esmeraldapizza.dk.evil','evil, mpanel.esmeraldapizza.dk','mpanel.esmeraldapizza.dk:444']) assert.equal(isMpanelHost(host),false);
 for(const [path, entry] of Object.entries(manifest.routes)) for(const method of ['GET','HEAD']) {
  const r=await mpanelHostResponse(new Request('https://mpanel.esmeraldapizza.dk'+path+'?file=../../secret',{method,headers:{host:'mpanel.esmeraldapizza.dk'}}));
  assert.equal(r.status,200,path);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.equal(r.headers.get('content-length'),String(entry.size));
  const body=Buffer.from(await r.arrayBuffer());
  if(method==='HEAD') assert.equal(body.length,0); else assert.equal(crypto.createHash('sha256').update(body).digest('hex'),entry.sha256);
  count++;
 }
 for(const route of table.routes) for(const path of route.aliases) for(const query of queries) {
  const r=await mpanelHostResponse(new Request(table.origin+path+query,{headers:{host:'mpanel.esmeraldapizza.dk'}}));
  assert.equal(r.status,301);assert.equal(r.headers.get('location'),table.origin+route.target_path+query);count++;
 }
 for(const path of ['/unknown','/api/auth','/internal-mpanel-host','/internal-mpanel-host?path=/','/_assets/missing.js','/hr/unknown','/%2e%2e/secret']) {
  const r=await mpanelHostResponse(new Request(table.origin+path,{headers:{host:'mpanel.esmeraldapizza.dk'}}));assert.equal(r.status,404,path);count++;
 }
 for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']) {
  const r=await mpanelHostResponse(new Request(table.origin+'/mpanel',{method,headers:{host:'mpanel.esmeraldapizza.dk'}}));assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'GET, HEAD');count++;
 }
 for(const host of ['web.orderfly.dk','esmeraldapizza.dk','evil.invalid']) {
  const r=await mpanelHostResponse(new Request(table.origin+'/',{headers:{host}}));assert.equal(r.status,404);count++;
 }
 console.log(`PASS ${count} route/query/payload/HEAD/denial assertions; 7 shells + 39 assets + robots`);
})().catch(e=>{console.error(e);process.exitCode=1});
