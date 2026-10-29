/* Apply once after homepage delivery v2; keep every original asset/deep page intact. */
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const dir='preview/esmeralda',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(`${dir}/manifest.json`)),packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`${dir}/payload.json.gz.part-00${i}`)));
if(hash(packed)!==manifest.payload_sha256)throw Error('Input payload integrity mismatch');
if(manifest.homepage_bootstrap)throw Error('Bootstrap patch already applied');
const payload=JSON.parse(zlib.gunzipSync(packed)),route='/_assets/website-consent.js',adapter=Buffer.from(payload[route].data,'base64');
if(hash(adapter)!==manifest.added_assets[route].sha256||!adapter.equals(fs.readFileSync(`${dir}/adapters/website-consent.js`)))throw Error('Consent owner is not the pinned adapter');
const code=adapter.toString('utf8');if(/document\.currentScript|<\/script/i.test(code))throw Error('Adapter cannot be embedded byte-identically');
let html=Buffer.from(payload['/'].data,'base64').toString('utf8');const old='<script src="/_assets/website-consent.js"></script>';
if(!html.startsWith('<!DOCTYPE html>')||!html.includes('<head>'+old)||(html.split(old).length-1)!==1)throw Error('Unexpected consent owner/order');
const inline=`<script data-website-consent-owner="inline-v1" data-consent-sha256="${hash(adapter)}">${code}</script>`;
html=html.replace(old,()=>inline);
// The section element cannot take listitem role. A div preserves its labelled list-item semantics/layout.
const hero=/<section role="listitem" id="pizza-club"[\s\S]*?<\/section>/;
if(!hero.test(html))throw Error('Unexpected Club wrapper');
html=html.replace(hero,markup=>markup.replace(/^<section/,'<div').replace(/<\/section>$/,'</div>'));
// These stale original-format preloads compete with the responsive AVIF selected by the real img.
let removed=0;html=html.replace(/<link\b[^>]*rel="preload"[^>]*href="\/_assets\/a0d1273deaf4aee98f5aaeb5\.webp"[^>]*>/g,()=>{removed++;return''});
if(removed!==2)throw Error('Expected two obsolete hero preloads');
const body=Buffer.from(html),entry={...payload['/'],data:body.toString('base64'),size:body.length,sha256:hash(body)};payload['/']=entry;manifest.routes['/']={file:entry.file,size:entry.size,sha256:entry.sha256};
manifest.homepage_bootstrap={version:1,consent_route:route,consent_sha256:hash(adapter),consent_placement:'first-synchronous-inline-script',removed_original_hero_preloads:removed,hero_semantics:'labelled-div-listitem'};
const output=zlib.gzipSync(Buffer.from(JSON.stringify(payload)),{level:9});if(output.length>18*1024*1024)throw Error('Payload exceeds three-part limit');for(let i=0;i<3;i++)fs.writeFileSync(`${dir}/payload.json.gz.part-00${i}`,output.subarray(i*6*1024*1024,(i+1)*6*1024*1024));manifest.payload_sha256=hash(output);fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({bytes:output.length,homeBytes:body.length,consentSha:hash(adapter),removed}));
