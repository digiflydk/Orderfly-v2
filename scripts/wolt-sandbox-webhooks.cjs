// Explicit sandbox registration/cleanup only. No production host or delivery creation is supported.
const fs=require('node:fs');
const crypto=require('node:crypto');
const HOST='https://daas-public-api.development.dev.woltapi.com';
const identifier=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(v);
async function manageSandboxWebhooks(action,credentials,callback,state,save,fetchImpl=fetch){
 credentials=Object.freeze({...credentials});callback=Object.freeze({...callback});state=state?structuredClone(state):null;
 if(!['status','register','cleanup'].includes(action)||credentials.environment!=='sandbox'||callback.environment!=='sandbox'||!identifier(credentials.merchantId)||typeof credentials.merchantKey!=='string'||!credentials.merchantKey)throw Error('INVALID_SANDBOX_CONFIGURATION');
 const url=new URL(callback.callbackUrl);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/callback/'+callback.callbackKey||!/^\w[\w-]{23,127}$/.test(callback.callbackKey)||typeof callback.secret!=='string'||callback.secret.length<32||callback.secret===credentials.merchantKey)throw Error('INVALID_CALLBACK_CONFIGURATION');
 const own={merchantFingerprint:crypto.createHash('sha256').update(credentials.merchantId).digest('hex'),callbackUrl:url.href};
 if(state&&(state.merchantFingerprint!==own.merchantFingerprint||state.callbackUrl!==own.callbackUrl))throw Error('OWNERSHIP_MISMATCH');
 const base='/v1/merchants/'+credentials.merchantId+'/webhooks';
 async function request(method,path,body){
  const response=await fetchImpl(HOST+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+credentials.merchantKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=response.status===204?null:await response.json().catch(()=>null);
  if(!response.ok)throw Error('SANDBOX_WEBHOOK_REQUEST_FAILED');
  return {status:response.status,data};
 }
 const listed=await request('GET',base);
 if(!Array.isArray(listed.data))throw Error('INVALID_WEBHOOK_LIST');
 const matching=listed.data.filter(v=>v&&v.callback_url===own.callbackUrl);
 if(matching.length>1)throw Error('DUPLICATE_CALLBACK_REQUIRES_REVIEW');
 if(action==='status')return {totalSubscriptions:listed.data.length,ownMatches:matching.length,phase:state?.phase??'not_registered'};
 if(action==='register'){
  if(matching.length||state?.phase==='registering'||state?.phase==='registered')throw Error('EXISTING_OR_UNKNOWN_REGISTRATION_DO_NOT_DUPLICATE');
  const intent={...own,phase:'registering',requestedAt:new Date().toISOString()};await save(intent);
  const created=await request('POST',base,{callback_url:own.callbackUrl,client_secret:callback.secret,disabled:false,callback_config:{exponential_retry_backoff:{exponent_base:2,max_retry_count:5}}});
  if(created.status!==201||!identifier(created.data?.id)||created.data?.callback_url!==own.callbackUrl)throw Error('UNKNOWN_REGISTRATION_OUTCOME');
  await save({...intent,phase:'registered',webhookId:created.data.id});
  return {status:'registered'};
 }
 if(!state||!['registering','registered','cleaned'].includes(state.phase))throw Error('NO_OWNED_REGISTRATION');
 if(!matching.length){await save({...state,phase:'cleaned'});return {status:'already_absent'}}
 const existing=matching[0];
 if(!identifier(existing.id)||(state.webhookId&&state.webhookId!==existing.id))throw Error('OWNERSHIP_MISMATCH');
 // A prior durable registering intent allows cleanup of the one exact callback after a lost POST response.
 await request('DELETE',base+'/'+existing.id);
 const after=await request('GET',base);
 if(!Array.isArray(after.data)||after.data.some(v=>v?.id===existing.id))throw Error('CLEANUP_NOT_CONFIRMED');
 await save({...state,phase:'cleaned',webhookId:existing.id,cleanedAt:new Date().toISOString()});
 return {status:'cleaned',remainingSubscriptions:after.data.length};
}
module.exports={manageSandboxWebhooks};
if(require.main===module)(async()=>{
 if(process.env.WOLT_CALLBACK_QA!=='sandbox-manage')throw Error('OPT_IN_REQUIRED');
 const readPrivate=p=>{if(!p||(fs.statSync(p).mode&0o077)!==0)throw Error('PRIVATE_FILE_REQUIRED');return JSON.parse(fs.readFileSync(p,'utf8'))};
 const creds=readPrivate(process.env.WOLT_SANDBOX_CREDENTIAL_FILE),callback=readPrivate(process.env.WOLT_CALLBACK_CONFIG_FILE),journal=process.env.WOLT_WEBHOOK_REGISTRATION_FILE;
 if(!journal)throw Error('JOURNAL_REQUIRED');
 const state=fs.existsSync(journal)?readPrivate(journal):null;
 const save=async value=>{const fd=fs.openSync(journal+'.tmp','w',0o600);try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(journal+'.tmp',journal);const directory=fs.openSync(require('node:path').dirname(journal),'r');try{fs.fsyncSync(directory)}finally{fs.closeSync(directory)}};
 console.log(JSON.stringify(await manageSandboxWebhooks(process.argv[2],creds,callback,state,save)));
})().catch(()=>{console.error('Sandbox webhook operation failed; inspect private registration journal. No secrets or provider payload printed.');process.exitCode=1});
