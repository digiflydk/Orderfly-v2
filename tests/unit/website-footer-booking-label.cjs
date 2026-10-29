const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const manifest=require('../../preview/esmeralda/manifest.json');
const {menuFilterBaseline}=require('../helpers/website-menu-filter-baseline.cjs');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)))));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const old='<a aria-label="Kontakt os" href="/bordbooking" class="footer_link">Book bord</a>',fixed='<a href="/bordbooking" class="footer_link">Book bord</a>';
test('103 corrected footer names are the only payload differences from ae203c3',()=>{
 let repaired=0;
 const original=Object.fromEntries(Object.entries(manifest.routes).map(([route,e])=>{
  let body=Buffer.from(payload[route].data,'base64');
  assert.equal(hash(body),e.sha256,route);assert.equal(body.length,e.size,route);
  body=menuFilterBaseline(route,body,manifest);
  if(e.file.endsWith('.html')&&route!=='/bordbooking'){
   const html=body.toString();assert.equal(html.split(fixed).length,2,route);assert.ok(!html.includes(old),route);
   // Reconstruct the exact reviewed parent, preserving every other label, URL,
   // asset, consent byte, form and script rather than repinning a broad baseline.
   body=Buffer.from(html.replace(fixed,old));repaired++;
  }
  return[route,{...e,size:body.length,sha256:hash(body)}];
 }).sort(([a],[b])=>a<b?-1:a>b?1:0));
 assert.equal(repaired,103);assert.equal(Object.keys(original).length,406);
 assert.equal(hash(JSON.stringify(original)),'4087d1855d9c674293432483ef03566dfc1b674473c3fbd9eb1aaf68ec9604ff');
 assert.deepEqual(manifest.footer_booking_label,{version:1,pages:103,accessible_name:'Book bord',destination:'/bordbooking'});
});
