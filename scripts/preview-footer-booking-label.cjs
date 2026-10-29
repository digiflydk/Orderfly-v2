/* Repair only the conflicting accessible name on the existing booking link. */
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const dir='preview/esmeralda',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
const packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`${dir}/payload.json.gz.part-00${i}`)));
if(hash(packed)!==manifest.payload_sha256)throw Error('Input payload integrity mismatch');
if(manifest.footer_booking_label)throw Error('Footer booking label patch already applied');
const payload=JSON.parse(zlib.gunzipSync(packed));
const old='<a aria-label="Kontakt os" href="/bordbooking" class="footer_link">Book bord</a>';
const fixed='<a href="/bordbooking" class="footer_link">Book bord</a>';
let pages=0;
for(const [route,entry]of Object.entries(payload)){
 if(!entry.file.endsWith('.html'))continue;
 const html=Buffer.from(entry.data,'base64').toString();
 if(route==='/bordbooking'){if(html.includes(old))throw Error('Booking page unexpectedly needs patch');continue;}
 if(html.split(old).length!==2)throw Error('Expected one conflicting footer label: '+route);
 const body=Buffer.from(html.replace(old,fixed));
 payload[route]={...entry,data:body.toString('base64'),size:body.length,sha256:hash(body)};
 manifest.routes[route]={...manifest.routes[route],size:body.length,sha256:hash(body)};
 pages++;
}
if(pages!==103)throw Error('Unexpected page inventory');
manifest.footer_booking_label={version:1,pages,accessible_name:'Book bord',destination:'/bordbooking'};
const output=zlib.gzipSync(Buffer.from(JSON.stringify(payload)),{level:9});
if(output.length>18*1024*1024)throw Error('Payload exceeds three-part limit');
for(let i=0;i<3;i++)fs.writeFileSync(`${dir}/payload.json.gz.part-00${i}`,output.subarray(i*6*1024*1024,(i+1)*6*1024*1024));
manifest.payload_sha256=hash(output);
fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({pages,payloadBytes:output.length}));
