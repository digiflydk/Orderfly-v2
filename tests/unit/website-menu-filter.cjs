const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const manifest=require('../../preview/esmeralda/manifest.json'),{menuFilterBaseline}=require('../helpers/website-menu-filter-baseline.cjs');
const packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`))),payload=JSON.parse(zlib.gunzipSync(packed));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
test('only menu filter changes; all406 parent payload entries reconstruct exactly',()=>{
 const original=Object.fromEntries(Object.entries(manifest.routes).map(([route,e])=>{
  const body=Buffer.from(payload[route].data,'base64');assert.equal(body.length,e.size,route);assert.equal(hash(body),e.sha256,route);
  const before=menuFilterBaseline(route,body,manifest);return[route,{...e,size:before.length,sha256:hash(before)}];
 }).sort(([a],[b])=>a<b?-1:a>b?1:0));
 assert.equal(Object.keys(original).length,406);
 assert.equal(hash(JSON.stringify(original)),'4f467336864b972912a0647b922b46a806d75acedf68c10eb2f227f5279609e6');
 assert.equal(hash(packed),manifest.payload_sha256);
 assert.deepEqual(manifest.menu_filter_accessibility,{version:1,route:'/menu',source_sha256:'6e2ad876a89f0e017838ab98c6048d39ad3da0c389084f19c4e9967e96efec59',scope:'native-keyboard-filter-and-no-inert-captcha'});
});
