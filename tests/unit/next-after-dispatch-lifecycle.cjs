const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');
// Real installed Next request lifecycle: prove awaited after work survives the
// response without holding it open. Domain dispatch/claim tests run separately.
test('Next after responds before callback completion and retains its awaited lifetime', {timeout:90000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orderfly-after-')),started=path.join(dir,'started'),release=path.join(dir,'release'),done=path.join(dir,'done');
 fs.symlinkSync(path.resolve('node_modules'),path.join(dir,'node_modules'),'dir');fs.mkdirSync(path.join(dir,'app','kick'),{recursive:true});
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({private:true}));fs.writeFileSync(path.join(dir,'app','layout.js'),'export default function Layout({children}){return <html><body>{children}</body></html>}');
 fs.writeFileSync(path.join(dir,'app','kick','route.js'),`import {after} from 'next/server';import fs from 'node:fs';export async function POST(){after(async()=>{fs.writeFileSync(${JSON.stringify(started)},'yes');while(!fs.existsSync(${JSON.stringify(release)}))await new Promise(resolve=>setTimeout(resolve,10));fs.writeFileSync(${JSON.stringify(done)},'yes');});return Response.json({committed:true});}`);
 const ready=path.join(dir,'ready');
 const child=spawn(process.execPath,['-e',`const next=require('next')({dev:true,dir:${JSON.stringify(dir)},hostname:'127.0.0.1'});next.prepare().then(()=>{const server=require('node:http').createServer(next.getRequestHandler());server.listen(0,'127.0.0.1',()=>require('node:fs').writeFileSync(${JSON.stringify(ready)},String(server.address().port)));});`],{cwd:dir,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 t.after(async()=>{fs.writeFileSync(release,'yes');if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;}fs.rmSync(dir,{recursive:true,force:true});});
 const waitFor=async(file,timeout=10000)=>{const deadline=Date.now()+timeout;while(!fs.existsSync(file)){if(Date.now()>deadline||child.exitCode!==null)throw Error('Next callback/ready missing: '+output);await new Promise(resolve=>setTimeout(resolve,10));}};
 await waitFor(ready,60000);const port=fs.readFileSync(ready,'utf8');
 const response=await fetch(`http://127.0.0.1:${port}/kick`,{method:'POST',signal:AbortSignal.timeout(60000)});assert.deepEqual(await response.json(),{committed:true});assert.equal(fs.existsSync(done),false);
 await waitFor(started);fs.writeFileSync(release,'yes');await waitFor(done);assert.equal(fs.readFileSync(done,'utf8'),'yes');
});
