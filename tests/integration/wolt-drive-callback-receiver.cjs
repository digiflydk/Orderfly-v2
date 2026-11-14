// Isolated sandbox test receiver. Never use this file as the Orderfly production inbox.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {loadTs}=require('../helpers/load-ts.cjs');
const mocks={'server-only':{}};
const {verifyWoltWebhook,WOLT_WEBHOOK_MAX_BYTES}=loadTs('src/lib/delivery/providers/wolt/webhook-verify.ts',mocks);
const {normalizeWoltEvent}=loadTs('src/lib/delivery/providers/wolt/events.ts',mocks);

function persistJournal(filename,state){
 const temporary=filename+'.tmp';
 const fd=fs.openSync(temporary,'w',0o600);
 try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,JSON.stringify(state));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 fs.renameSync(temporary,filename);
 const directory=fs.openSync(path.dirname(filename),'r');
 try{fs.fsyncSync(directory)}finally{fs.closeSync(directory)}
}
function createSandboxReceiver(config,journalFile){
 if(config.environment!=='sandbox'||typeof config.secret!=='string'||config.secret.length<32||!/^[a-zA-Z0-9_-]{24,128}$/.test(config.callbackKey)||!config.merchantId)throw Error('INVALID_SANDBOX_RECEIVER_CONFIG');
 const safe=Object.freeze({...config});
 let state={version:1,receipts:{},duplicates:0};
 if(fs.existsSync(journalFile)){
  if((fs.statSync(journalFile).mode&0o077)!==0)throw Error('PRIVATE_JOURNAL_REQUIRED');
  state=JSON.parse(fs.readFileSync(journalFile,'utf8'));
  if(state.version!==1||!state.receipts||!Number.isSafeInteger(state.duplicates))throw Error('INVALID_JOURNAL');
 }
 const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('sandbox-receiver');return}
  if(req.url!=='/callback/'+safe.callbackKey){res.writeHead(404);res.end();return}
  if(req.method!=='POST'){res.writeHead(405);res.end();return}
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){res.writeHead(415);res.end();return}
  let bytes=0;const chunks=[];
  try{
   for await(const chunk of req){bytes+=chunk.length;if(bytes>WOLT_WEBHOOK_MAX_BYTES){res.writeHead(413);res.end();return}chunks.push(chunk)}
   const raw=Buffer.concat(chunks);
   const at=new Date().toISOString();
   let normalized;
   try{normalized=normalizeWoltEvent(verifyWoltWebhook(raw,safe.secret,Date.now()),safe.merchantId,at)}
   catch{res.writeHead(400);res.end();return}
   const next=structuredClone(state);
   if(next.receipts[normalized.dedupeIdentity])next.duplicates++;
   else next.receipts[normalized.dedupeIdentity]={receivedAt:at,event:normalized,envelope:raw.toString('utf8')};
   // Acknowledge only after data and directory metadata are durable. No financial, kitchen or print writes.
   persistJournal(journalFile,next);state=next;
   res.writeHead(200);res.end();
  }catch{if(!res.headersSent)res.writeHead(503);res.end()}
 });
 server.requestTimeout=10_000;server.headersTimeout=5_000;server.maxHeadersCount=30;
 return server;
}
module.exports={createSandboxReceiver};

if(require.main===module){
 try{
  if(process.env.WOLT_CALLBACK_QA!=='sandbox-receiver'||!process.env.WOLT_CALLBACK_CONFIG_FILE||!process.env.WOLT_CALLBACK_JOURNAL_FILE)throw Error('OPT_IN_REQUIRED');
  if((fs.statSync(process.env.WOLT_CALLBACK_CONFIG_FILE).mode&0o077)!==0)throw Error('PRIVATE_CONFIG_REQUIRED');
  const config=JSON.parse(fs.readFileSync(process.env.WOLT_CALLBACK_CONFIG_FILE,'utf8'));
  const port=config.port??8787;if(!Number.isInteger(port)||port<1024||port>65535)throw Error('INVALID_PORT');
  const server=createSandboxReceiver(config,process.env.WOLT_CALLBACK_JOURNAL_FILE);
  server.listen(port,'127.0.0.1',()=>console.log('Sandbox callback receiver listening on loopback; no public ingress or Wolt subscription implied.'));
 }catch{console.error('Sandbox receiver configuration failed; private values omitted.');process.exitCode=1}
}
