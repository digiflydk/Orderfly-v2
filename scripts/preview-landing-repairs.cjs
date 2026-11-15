/* Apply once: landing-page repairs before the Google Ads launch (contact actions, mobile menu
 * filter, dish image variants, no Webflow CDN preconnect). See scripts/website-landing-repairs.cjs.
 * Run after scripts/preview-image-variants.cjs. */
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {applyLandingRepairs,reverseLandingRepairs}=require('./website-landing-repairs.cjs');
const dir='preview/esmeralda',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
const packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`${dir}/payload.json.gz.part-00${i}`)));
if(hash(packed)!==manifest.payload_sha256)throw Error('Input payload integrity mismatch');
if(manifest.landing_repairs)throw Error('Landing repairs already applied');
const variantsFile=fs.readFileSync(`${dir}/variants.json`),variants=JSON.parse(variantsFile);
if(variants.source_payload_sha256!==manifest.payload_sha256)throw Error('Variants were generated from a different payload');
for(const [route,v] of Object.entries(variants.routes)){
 const bytes=fs.readFileSync(`${dir}/variants/${route.slice('/_assets/'.length)}`);
 if(hash(bytes)!==v.sha256||bytes.length!==v.size)throw Error('Variant integrity mismatch '+route);
 if(Object.hasOwn(manifest.routes,route))throw Error('Variant route collides with a payload route '+route);
}
const payload=JSON.parse(zlib.gunzipSync(packed));
let pages=0,images=0;
for(const [route,entry] of Object.entries(payload)){
 if(!entry.file.endsWith('.html'))continue;
 const html=Buffer.from(entry.data,'base64').toString('utf8'),next=applyLandingRepairs(route,html,variants.routes);
 if(reverseLandingRepairs(route,next)!==html)throw Error('Repair is not exactly reversible on '+route);
 if(next===html)continue;
 const body=Buffer.from(next);pages++;images+=(next.match(/data-es-variant="1"/g)||[]).length;
 payload[route]={...entry,data:body.toString('base64'),size:body.length,sha256:hash(body)};
 manifest.routes[route]={...manifest.routes[route],size:body.length,sha256:hash(body)};
}
manifest.landing_repairs={version:1,pages,images_with_variants:images,variants_sha256:hash(variantsFile),contact:'direct-phone-email',menu_filter:'scroll-inside-viewport',webflow_cdn_preconnect:'removed'};
const output=zlib.gzipSync(Buffer.from(JSON.stringify(payload)),{level:9});
if(output.length>18*1024*1024)throw Error('Payload exceeds three-part limit');
for(let i=0;i<3;i++)fs.writeFileSync(`${dir}/payload.json.gz.part-00${i}`,output.subarray(i*6*1024*1024,(i+1)*6*1024*1024));
manifest.payload_sha256=hash(output);
fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({pages,images,payloadBytes:output.length}));
