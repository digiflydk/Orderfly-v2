/* Apply once: website content fixes (see scripts/website-content-fixes.cjs). */
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {applyContentFixes,reverseContentFixes}=require('./website-content-fixes.cjs');
const dir='preview/esmeralda',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
const packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`${dir}/payload.json.gz.part-00${i}`)));
if(hash(packed)!==manifest.payload_sha256)throw Error('Input payload integrity mismatch');
if(manifest.content_fixes)throw Error('Content fixes already applied');
const payload=JSON.parse(zlib.gunzipSync(packed));
const changed=[];
for(const [route,entry] of Object.entries(payload)){
 if(!entry.file.endsWith('.html'))continue;
 const html=Buffer.from(entry.data,'base64').toString('utf8'),next=applyContentFixes(route,html);
 if(next===html)continue;
 if(reverseContentFixes(route,next)!==html)throw Error('Content fix is not exactly reversible on '+route);
 const body=Buffer.from(next);changed.push(route);
 payload[route]={...entry,data:body.toString('base64'),size:body.length,sha256:hash(body)};
 manifest.routes[route]={...manifest.routes[route],size:body.length,sha256:hash(body)};
}
if(changed.sort().join()!=='/dishes/15-pastrami-speciale,/menu,/menu/desserter,/menu/pizza')throw Error('Unexpected pages '+changed);
manifest.content_fixes={version:1,pages:changed,pastrami_heading:'repeated word removed',duplicate_tiramisu:{removed_card:'/menu/desserter',redirect:'/dishes/hjemmelavet-tiramisu-2 -> /dishes/hjemmelavet-tiramisu'}};
const output=zlib.gzipSync(Buffer.from(JSON.stringify(payload)),{level:9});
if(output.length>18*1024*1024)throw Error('Payload exceeds three-part limit');
for(let i=0;i<3;i++)fs.writeFileSync(`${dir}/payload.json.gz.part-00${i}`,output.subarray(i*6*1024*1024,(i+1)*6*1024*1024));
manifest.payload_sha256=hash(output);
fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({changed,payloadBytes:output.length}));
