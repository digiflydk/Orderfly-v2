// Real Next middleware + internal rewrites. Loopback only, no browser/provider writes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const crypto=require('node:crypto');
const manifest=require('../../preview/esmeralda/manifest.json');
const discovery=require('../../preview/esmeralda/production-discovery.json');
const mpanel=require('../../mpanel/esmeralda/manifest.json');
async function withServer(enabled,fn){
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:path.resolve('.next/standalone'),env:{...process.env,ESMERALDA_PUBLIC_ENABLED:enabled,HOSTNAME:'localhost',PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const rawGet=(p,host,opts={})=>new Promise((resolve,reject)=>{const req=require('node:http').request({hostname:'localhost',port,path:p,headers:{host,'x-forwarded-host':host,'x-forwarded-proto':'https',...opts.headers}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:new Headers(res.headers),text:async()=>Buffer.concat(chunks).toString()}));});req.on('error',reject);req.end();});
 const get=(p,host='www.esmeraldapizza.dk',opts={})=>p.endsWith('?')?rawGet(p,host,opts):fetch(`http://localhost:${port}${p}`,{redirect:'manual',...opts,headers:{host,'x-forwarded-host':host,'x-forwarded-proto':'https',...opts.headers}});
 try{let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(output);try{await get('/robots.txt');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert.ok(ready,output);await fn(get);}catch(e){console.error(output);throw e;}finally{child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));}
}
test('actual HTTP production switch defaults closed on every private/public path',async()=>withServer('',async get=>{
 for(const host of ['esmeraldapizza.dk','www.esmeraldapizza.dk','mpanel.esmeraldapizza.dk'])for(const p of ['/','/api/health','/_next/image','/hr/timelog']){const r=await get(p,host);assert.equal(r.status,503,host+p);assert.match(r.headers.get('x-robots-tag'),/noindex/);}
 const preview=await get('/','web.orderfly.dk');assert.equal(preview.status,200);assert.match(preview.headers.get('x-robots-tag'),/noindex/);
}));
test('actual HTTP production content, discovery, exact-host routing and mPanel integration',async()=>withServer('true',async get=>{
 for(const [p,e]of Object.entries(manifest.routes)) {
  if(p==='/robots.txt'||p==='/book-bord')continue;
  const r=await get(p+'?path=/api/health');assert.equal(r.status,200,p);assert.equal(r.headers.get('x-robots-tag'),null,p);
  assert.equal(crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),e.sha256,p);
 }
 const sitemap=await get('/sitemap.xml');assert.equal(sitemap.status,200);assert.deepEqual([...((await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g))].map(x=>x[1]),discovery.public_urls);
 assert.match(await(await get('/robots.txt')).text(),/Allow: \/\n/);
 for(const q of ['','?next=%2Fmenu%3Fx%3D1&literal=%252F&a=1&a=2', '?space=a%20b&lower=%2f&tilde=~&empty=&a=1&a=2']){
  const apex=await get('/menu'+q,'esmeraldapizza.dk');assert.equal(apex.status,308);assert.equal(apex.headers.get('location'),'https://www.esmeraldapizza.dk/menu'+q);
  const legacy=await get('/hr/timelog'+q);assert.equal(legacy.status,308);assert.equal(legacy.headers.get('location'),'https://mpanel.esmeraldapizza.dk/hr/timelog'+q);assert.match(legacy.headers.get('x-robots-tag'),/noindex/);
  const alias=await get('/admin-v2'+q,'mpanel.esmeraldapizza.dk');assert.equal(alias.status,301);assert.equal(alias.headers.get('location'),'https://mpanel.esmeraldapizza.dk/hr/admin'+q);
  const https=await get('/admin-v2'+q,'mpanel.esmeraldapizza.dk',{headers:{'x-forwarded-proto':'http'}});assert.equal(https.status,308);assert.equal(https.headers.get('location'),'https://mpanel.esmeraldapizza.dk/admin-v2'+q);
  const booking=await get('/book-bord'+q);assert.equal(booking.status,307);assert.equal(booking.headers.get('location'),'/bordbooking'+q);
 }
 // Next normalizes a bare separator even in original App Router Request.url; no query values exist to lose.
 const emptyQuery=await get('/menu?','esmeraldapizza.dk');assert.equal(emptyQuery.status,308);assert.equal(emptyQuery.headers.get('location'),'https://www.esmeraldapizza.dk/menu');
 for(const host of ['www.esmeraldapizza.dk','mpanel.esmeraldapizza.dk','web.orderfly.dk','orderfly.dk'])for(const p of ['/internal-web-preview?path=/','/internal-mpanel-host?path=/'])assert.equal((await get(p,host)).status,404,host+p);
 for(const p of ['/api/health','/api/checkout','/_next/image?url=https://evil.example','/missing?path=/'])assert.equal((await get(p)).status,404,p);
 for(const host of ['www.esmeraldapizza.dk','esmeraldapizza.dk','mpanel.esmeraldapizza.dk'])for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])assert.equal((await get('/api/health',host,{method,headers:{'next-action':'synthetic'}})).status,405);
 for(const [p,e]of Object.entries(mpanel.routes)){
  const r=await get(p,'mpanel.esmeraldapizza.dk');assert.equal(r.status,200,p);assert.match(r.headers.get('x-robots-tag'),/noindex/);
  assert.equal(crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),e.sha256,p);
 }
 const head=await get('/','www.esmeraldapizza.dk',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 const preview=await get('/robots.txt','web.orderfly.dk');assert.match(await preview.text(),/Disallow: \//);assert.match(preview.headers.get('content-security-policy'),/form-action 'none'; frame-src 'none'/);
}));
