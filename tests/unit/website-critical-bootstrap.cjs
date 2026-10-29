const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {assertConsentOwner}=require('../helpers/website-consent-owner.cjs'),manifest=require('../../preview/esmeralda/manifest.json');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`))))),bytes=route=>Buffer.from(payload[route].data,'base64'),html=bytes('/').toString(),adapter=bytes('/_assets/website-consent.js'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
test('inline bootstrap is the entire pinned synchronous owner and rejects tampering, duplication or relocation',()=>{
 const {owner}=assertConsentOwner(html,'/',adapter,manifest);assert.ok(!html.includes('<script src="/_assets/website-consent.js">'));assert.equal(owner.body,adapter.toString());
 for(const bad of [html.replace(owner.full,owner.full.replace('</script>','\n</script>')),html.replace('<head>','<head><script src="/_assets/website-consent.js"></script>'),html.replace(owner.full,owner.full.replace('<script ','<script defer '))])assert.throws(()=>assertConsentOwner(bad,'/',adapter,manifest));
 assert.throws(()=>assertConsentOwner(html,'/nyhedsbrev',adapter,manifest));
});
test('all405non-home routes retain their exact35c80e48 manifest entries and bytes',()=>{
 const entries=Object.fromEntries(Object.entries(manifest.routes).filter(([route])=>route!=='/').sort(([a],[b])=>a<b?-1:a>b?1:0));assert.equal(Object.keys(entries).length,405);
 assert.equal(hash(JSON.stringify(entries)),'23ac68068c50a0bbfea4ddf867c55c6cde1848e33fc09105d7edab559f2b9183');
 let deepPages=0;for(const [route,e]of Object.entries(entries)){assert.equal(bytes(route).length,e.size,route);assert.equal(hash(bytes(route)),e.sha256,route);if(e.file.endsWith('.html')){deepPages++;assertConsentOwner(bytes(route).toString(),route,adapter,manifest);}}assert.equal(deepPages,103);
});
test('original-format hero preloads are gone; responsive image, content, labels and NCF loader remain',()=>{
 assert.doesNotMatch(html,/<link\b[^>]*rel="preload"[^>]*a0d1273deaf4aee98f5aaeb5\.webp/);
 assert.match(html,/<div role="listitem" id="pizza-club"[^>]*aria-labelledby="es-club-heading"/);assert.doesNotMatch(html,/<section[^>]*role="listitem"/);
 assert.match(html,/<script defer src="\/_assets\/c20b9103a46c955dbf875b86.js"/);assert.match(html,/<img[^>]*srcset="[^\"]+"[^>]*sizes="\(max-width: 767px\) 150vw, 100vw"/);
});
