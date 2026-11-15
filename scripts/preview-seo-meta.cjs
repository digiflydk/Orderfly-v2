/* Apply once: unique titles, descriptions and share previews for the generic-title pages.
 * See scripts/website-seo-meta.cjs. */
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {applySeoMeta,reverseSeoMeta,GENERIC_TITLE}=require('./website-seo-meta.cjs');
const dir='preview/esmeralda',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
const packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`${dir}/payload.json.gz.part-00${i}`)));
if(hash(packed)!==manifest.payload_sha256)throw Error('Input payload integrity mismatch');
if(manifest.seo_meta)throw Error('SEO metadata already applied');
const payload=JSON.parse(zlib.gunzipSync(packed));
let pages=0;
for(const [route,entry] of Object.entries(payload)){
 if(!entry.file.endsWith('.html'))continue;
 const html=Buffer.from(entry.data,'base64').toString('utf8'),next=applySeoMeta(route,html);
 if(next===html)continue;
 if(reverseSeoMeta(route,next)!==html)throw Error('SEO metadata is not exactly reversible on '+route);
 if(next.includes(GENERIC_TITLE))throw Error('Generic title left on '+route);
 const body=Buffer.from(next);pages++;
 payload[route]={...entry,data:body.toString('base64'),size:body.length,sha256:hash(body)};
 manifest.routes[route]={...manifest.routes[route],size:body.length,sha256:hash(body)};
}
if(pages!==91)throw Error('Unexpected page count '+pages);
manifest.seo_meta={version:1,pages,source:'page heading, description and image'};
const output=zlib.gzipSync(Buffer.from(JSON.stringify(payload)),{level:9});
if(output.length>18*1024*1024)throw Error('Payload exceeds three-part limit');
for(let i=0;i<3;i++)fs.writeFileSync(`${dir}/payload.json.gz.part-00${i}`,output.subarray(i*6*1024*1024,(i+1)*6*1024*1024));
manifest.payload_sha256=hash(output);
fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({pages,payloadBytes:output.length}));
