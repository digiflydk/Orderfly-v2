// Run after npm run build. Real standalone Next HTTP flow; loopback only.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const crypto=require('node:crypto');
const manifest=require('../../preview/esmeralda/manifest.json');

test('real Next middleware-to-handler flow serves pinned paths, never client path query',async()=>{
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const cwd=path.resolve('.next/standalone');
 const child=spawn(process.execPath,['server.js'],{cwd,env:{...process.env,HOSTNAME:'localhost',PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const get=(p,opts={})=>fetch(`http://localhost:${port}${p}`,{redirect:'manual',...opts,headers:{host:'web.orderfly.dk','x-forwarded-host':'web.orderfly.dk','x-forwarded-proto':'https',...opts.headers}});
 try {
  let ready=false;
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(output);try{await get('/robots.txt');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(ready,'standalone started: '+output);
  for(const [route,entry] of Object.entries(manifest.routes)) {
   const r=await get(route);assert.equal(r.status,200,route);
   const bytes=Buffer.from(await r.arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256,route);
   assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  }
  for(const route of ['/','/menu','/dishes/1-margherita-v']) {
   const r=await get(route+'?path=/unknown');assert.equal(r.status,200,route);
   assert.equal(crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),manifest.routes[route].sha256);
   const h=await get(route,{method:'HEAD'});assert.equal(h.status,200);assert.equal(await h.text(),'');
  }
  for(const route of ['/api/health','/_next/image?url=https://example.com/x','/mpanel','/internal-web-preview?path=/','/unknown?path=/']) assert.equal((await get(route)).status,404,route);
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']) assert.equal((await get('/api/health',{method,headers:{'next-action':'synthetic-action'}})).status,405,method);
  for(const host of ['orderfly.dk','esmeralda.orderfly.dk']) assert.equal((await get('/internal-web-preview?path=/',{headers:{host,'x-forwarded-host':host}})).status,404,host);
 } catch(error) {console.error('Standalone output:',output);throw error;} finally {child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));}
});
