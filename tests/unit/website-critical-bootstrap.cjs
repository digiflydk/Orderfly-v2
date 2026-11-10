const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {assertConsentOwner}=require('../helpers/website-consent-owner.cjs'),manifest=require('../../preview/esmeralda/manifest.json');
const {menuFilterBaseline}=require('../helpers/website-menu-filter-baseline.cjs');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`))))),bytes=route=>Buffer.from(payload[route].data,'base64'),html=bytes('/').toString(),adapter=bytes('/_assets/website-consent.js'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
test('inline bootstrap is the entire pinned synchronous owner and rejects tampering, duplication or relocation',()=>{
 const {owner}=assertConsentOwner(html,'/',adapter,manifest);assert.ok(!html.includes('<script src="/_assets/website-consent.js">'));assert.equal(owner.body,adapter.toString());
 for(const bad of [html.replace(owner.full,owner.full.replace('</script>','\n</script>')),html.replace('<head>','<head><script src="/_assets/website-consent.js"></script>'),html.replace(owner.full,owner.full.replace('<script ','<script defer '))])assert.throws(()=>assertConsentOwner(bad,'/',adapter,manifest));
 assert.throws(()=>assertConsentOwner(html,'/nyhedsbrev',adapter,manifest));
});
test('all405non-home routes retain35c80e48 bytes except the explicit footer accessible-name repair and Orderfly GTM adapter',()=>{
 // The consent adapter is the one intentional change (GTM-PK4J8ZFD); pin it separately and compare the rest with the prior baseline.
 const consentRoute='/_assets/website-consent.js',gtm=manifest.gtm_orderfly;
 assert.equal(gtm.container,'GTM-PK4J8ZFD');assert.equal(gtm.previous_consent_sha256,'54f55fe8ea592f26e8fe43c0dedf5c5d6b3acd24c927a46cd6f322d49c35d1a4');
 assert.equal(hash(adapter),gtm.consent_sha256);assert.deepEqual(adapter,fs.readFileSync('preview/esmeralda/adapters/website-consent.js'));
 const old='<a aria-label="Kontakt os" href="/bordbooking" class="footer_link">Book bord</a>',fixed='<a href="/bordbooking" class="footer_link">Book bord</a>';
 const originalBytes=route=>{const body=menuFilterBaseline(route,bytes(route),manifest);if(!manifest.routes[route].file.endsWith('.html')||route==='/bordbooking')return body;const html=body.toString();assert.equal(html.split(fixed).length,2,route);assert.ok(!html.includes(old),route);return Buffer.from(html.replace(fixed,old));};
 const entries=Object.fromEntries(Object.entries(manifest.routes).filter(([route])=>route!=='/').map(([route,e])=>{if(route===consentRoute)return[route,{...e,size:9468,sha256:gtm.previous_consent_sha256}];const body=originalBytes(route);return[route,{...e,size:body.length,sha256:hash(body)}];}).sort(([a],[b])=>a<b?-1:a>b?1:0));assert.equal(Object.keys(entries).length,405);
 assert.equal(hash(JSON.stringify(entries)),'23ac68068c50a0bbfea4ddf867c55c6cde1848e33fc09105d7edab559f2b9183');
 let deepPages=0;for(const [route,e]of Object.entries(entries)){if(route===consentRoute)continue;assert.equal(originalBytes(route).length,e.size,route);assert.equal(hash(originalBytes(route)),e.sha256,route);if(e.file.endsWith('.html')){deepPages++;assertConsentOwner(bytes(route).toString(),route,adapter,manifest);}}assert.equal(deepPages,103);
});
test('original-format hero preloads are gone; responsive image, content, labels and NCF loader remain',()=>{
 assert.doesNotMatch(html,/<link\b[^>]*rel="preload"[^>]*a0d1273deaf4aee98f5aaeb5\.webp/);
 assert.match(html,/<div role="listitem" id="pizza-club"[^>]*aria-labelledby="es-club-heading"/);assert.doesNotMatch(html,/<section[^>]*role="listitem"/);
 assert.match(html,/<script defer src="\/_assets\/c20b9103a46c955dbf875b86.js"/);assert.match(html,/<img[^>]*srcset="[^\"]+"[^>]*sizes="\(max-width: 767px\) 150vw, 100vw"/);
});
