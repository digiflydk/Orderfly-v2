/* Apply once per version: ship the consent adapter that loads GTM-PK4J8ZFD after statistics or marketing consent. */
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {applyClubPromoGtm}=require('./website-club-promo-gtm.cjs');
const dir='preview/esmeralda',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
const packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`${dir}/payload.json.gz.part-00${i}`)));
if(hash(packed)!==manifest.payload_sha256)throw Error('Input payload integrity mismatch');
// Version 1 loaded GTM-PK4J8ZFD on statistics only; version 2 required statistics and marketing. Version 3
// (PO decision 2026-11-10: GTM owns GA4 and Google Ads) loads both containers for either purpose and relies on Consent Mode.
// Version 4 (2026-11-11) retires GTM-52G3QF76 and moves the homepage Club promotion to plain GTM dataLayer events.
const VERSION=4,CONSENT='analytics_storage|ad_storage';
if(manifest.gtm_orderfly?.version>=VERSION)throw Error('Orderfly GTM patch already applied');
const route='/_assets/website-consent.js',payload=JSON.parse(zlib.gunzipSync(packed));
const previous=Buffer.from(payload[route].data,'base64'),previousSha=hash(previous);
if(previousSha!==manifest.added_assets[route].sha256||previousSha!==manifest.homepage_bootstrap.consent_sha256)throw Error('Unexpected previous consent adapter');
if(manifest.gtm_orderfly&&previousSha!==manifest.gtm_orderfly.consent_sha256)throw Error('Unexpected previous version consent adapter');
const originalSha=manifest.gtm_orderfly?.previous_consent_sha256??previousSha;
const adapter=fs.readFileSync(`${dir}/adapters/website-consent.js`),sha=hash(adapter),code=adapter.toString('utf8');
if(sha===previousSha)throw Error('Adapter unchanged');
if(/document\.currentScript|<\/script/i.test(code))throw Error('Adapter cannot be embedded byte-identically');
if(!code.includes('gtm.js?id=GTM-PK4J8ZFD')||code.includes('gtm.js?id=GTM-52G3QF76'))throw Error('Adapter must load only GTM-PK4J8ZFD');
const set=(key,bytes)=>{payload[key]={...payload[key],data:bytes.toString('base64'),size:bytes.length,sha256:hash(bytes)};manifest.routes[key]={...manifest.routes[key],size:bytes.length,sha256:hash(bytes)};};
set(route,adapter);
// The homepage carries the adapter inline as its first synchronous script.
const oldInline=`<script data-website-consent-owner="inline-v1" data-consent-sha256="${previousSha}">${previous.toString('utf8')}</script>`;
const home=Buffer.from(payload['/'].data,'base64').toString('utf8');
if(home.split(oldInline).length!==2||!home.includes('<head>'+oldInline))throw Error('Unexpected homepage consent owner');
set('/',Buffer.from(applyClubPromoGtm(home.replace(oldInline,()=>`<script data-website-consent-owner="inline-v1" data-consent-sha256="${sha}">${code}</script>`))));
manifest.added_assets[route]={...manifest.added_assets[route],sha256:sha};
manifest.homepage_bootstrap={...manifest.homepage_bootstrap,consent_sha256:sha};
manifest.gtm_orderfly={version:VERSION,container:'GTM-PK4J8ZFD',consent:CONSENT,retired_container:'GTM-52G3QF76',club_promotion:'gtm-datalayer-v1',previous_consent_sha256:originalSha,consent_sha256:sha};
const output=zlib.gzipSync(Buffer.from(JSON.stringify(payload)),{level:9});
if(output.length>18*1024*1024)throw Error('Payload exceeds three-part limit');
for(let i=0;i<3;i++)fs.writeFileSync(`${dir}/payload.json.gz.part-00${i}`,output.subarray(i*6*1024*1024,(i+1)*6*1024*1024));
manifest.payload_sha256=hash(output);
fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({consentSha:sha,payloadBytes:output.length}));
