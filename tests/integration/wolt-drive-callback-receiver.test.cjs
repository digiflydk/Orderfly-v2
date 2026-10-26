const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHmac}=require('node:crypto');
const {createSandboxReceiver}=require('./wolt-drive-callback-receiver.cjs');
const config={environment:'sandbox',secret:'synthetic-secret-for-callback-fixture-only',callbackKey:'synthetic-opaque-callback-key',merchantId:'synthetic-merchant'};
function envelope(secret=config.secret){const payload={type:'order.received',dispatched_at:new Date().toISOString(),details:{id:'synthetic-event',wolt_order_reference_id:'synthetic-order',venue_id:'synthetic-venue'}};const p=[{alg:'HS256',typ:'JWT'},payload].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url'));return JSON.stringify({token:[...p,createHmac('sha256',secret).update(p.join('.')).digest('base64url')].join('.')})}
async function setup(t,journalSuffix='journal.json'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wolt-callback-'));const file=path.join(dir,journalSuffix);const server=createSandboxReceiver(config,file);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true})});
 return {file,dir,url:`http://127.0.0.1:${server.address().port}/callback/${config.callbackKey}`,server};
}
test('authentic synthetic events fsync before ACK and duplicate replay persists once across restart',async t=>{
 const f=await setup(t),body=envelope();
 const send=()=>fetch(f.url,{method:'POST',headers:{'Content-Type':'application/json'},body});
 assert.equal((await send()).status,200);assert.equal((await send()).status,200);
 const state=JSON.parse(fs.readFileSync(f.file,'utf8'));assert.equal(Object.keys(state.receipts).length,1);assert.equal(state.duplicates,1);assert.equal(fs.statSync(f.file).mode&0o077,0);
 const restarted=createSandboxReceiver(config,f.file);await new Promise(resolve=>restarted.listen(0,'127.0.0.1',resolve));
 try{assert.equal((await fetch(`http://127.0.0.1:${restarted.address().port}/callback/${config.callbackKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body})).status,200);assert.equal(JSON.parse(fs.readFileSync(f.file,'utf8')).duplicates,2)}finally{restarted.closeAllConnections();await new Promise(resolve=>restarted.close(resolve))}
});
test('forged, oversized, wrong-path and failed-persistence requests never get successful ACK',async t=>{
 const f=await setup(t);
 assert.equal((await fetch(f.url,{method:'POST',headers:{'Content-Type':'application/json'},body:envelope('foreign-secret')})).status,400);assert.equal(fs.existsSync(f.file),false);
 assert.equal((await fetch(f.url+'wrong',{method:'POST',body:envelope()})).status,404);
 assert.equal((await fetch(f.url,{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(70000)})).status,413);
 const broken=await setup(t,'missing-directory/journal.json');
 assert.equal((await fetch(broken.url,{method:'POST',headers:{'Content-Type':'application/json'},body:envelope()})).status,503);assert.equal(fs.existsSync(broken.file),false);
});
