// Explicit opt-in. This runner makes quote requests only, never courier bookings or subscription writes.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const schedule=loadTs('src/lib/delivery/providers/wolt/schedule.ts',{'server-only':{}});
const {createWoltHttpClient}=loadTs('src/lib/delivery/providers/wolt/http.ts',{'server-only':{}});
const {requestWoltQuote}=loadTs('src/lib/delivery/providers/wolt/quote.ts',{'server-only':{},'./schedule':schedule});

async function run(){
 if(process.env.WOLT_SANDBOX_QA!=='quote-only'||!process.env.WOLT_SANDBOX_CREDENTIAL_FILE)throw new Error('SANDBOX_OPT_IN_REQUIRED');
 const file=process.env.WOLT_SANDBOX_CREDENTIAL_FILE;
 const stat=fs.statSync(file);
 if((stat.mode&0o077)!==0)throw new Error('PRIVATE_CREDENTIAL_FILE_REQUIRED');
 const credential=JSON.parse(fs.readFileSync(file,'utf8'));
 if(credential.environment!=='sandbox'||typeof credential.merchantKey!=='string'||!credential.merchantKey||!/^[a-zA-Z0-9_-]+$/.test(credential.venueId))throw new Error('SANDBOX_CREDENTIAL_CONFIGURATION_INVALID');
 const client=createWoltHttpClient({baseUrl:'https://daas-public-api.development.dev.woltapi.com',merchantKey:credential.merchantKey});
 const results=[];
 for(const scheduled of [false,true]){
  const now=Date.now();
  const input={venueId:credential.venueId,address:{street:'Borgergade',building:'12',city:'Copenhagen',postCode:'1300'},preparationMinutes:30,parcels:[{count:1}],...(scheduled?{scheduledDropoffTime:new Date(now+12*3600000).toISOString()}:{})};
  const result=await requestWoltQuote(client,input,now);
  assert.equal(result.status,'available','Sandbox quote was not available');
  assert.equal(result.cost.currency,'DKK');assert.equal(result.cost.taxBasis,'inclusive');
  assert.equal(result.pickupEtaReliable,false);assert.equal(result.distance,null);
  assert.ok(result.expiresAt&&Date.parse(result.expiresAt)>now);
  if(scheduled)assert.equal(Date.parse(result.deliveryEstimate.earliest),Date.parse(input.scheduledDropoffTime));
  results.push({scenario:scheduled?'scheduled':'asap',status:result.status,costMinor:result.cost.amount,currency:result.cost.currency,checkedAt:new Date(now).toISOString()});
 }
 console.log(JSON.stringify({layer:'genuine_wolt_sandbox_quote_only',results,notTested:['create','cancel','callback_receipt','checkout','production','hardware']}));
}
run().catch(()=>{console.error('Wolt sandbox quote QA failed. Inspect sanitized adapter outcome locally; credential and raw response are intentionally omitted.');process.exitCode=1;});
