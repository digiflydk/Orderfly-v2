const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {assertConsentOwner}=require('../helpers/website-consent-owner.cjs');
const sharp=require('sharp'),baseline=require('../fixtures/website-home-delivery-baseline.json'),manifest=require('../../preview/esmeralda/manifest.json');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`))))),bytes=k=>Buffer.from(payload[k].data,'base64'),html=bytes('/').toString(),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
test('homepage avoids stylesheet roundtrips with byte-identical pinned CSS and retains first consent bootstrap',()=>{
 assertConsentOwner(html,'/',bytes('/_assets/website-consent.js'),manifest);
 for(const {route,sha256}of manifest.homepage_delivery.inline_css){const css=bytes(route).toString();assert.equal(sha(bytes(route)),sha256);assert.ok(html.includes(`<style data-home-delivery-css="${route}">${css}</style>`));assert.ok(!html.includes(`<link href="${route}"`));assert.doesNotMatch(css,/url\((?!['"]?(?:\/_assets\/|data:))/);}
});
test('every original deep page and asset remains exact; only homepage changes and new derivative assets are added',()=>{
 assert.equal(Object.keys(baseline.routes).length,376);
 for(const [route,entry]of Object.entries(baseline.routes)){if(route==='/')continue;assert.deepEqual(manifest.routes[route],entry,route);assert.equal(sha(bytes(route)),entry.sha256,route);}
 const added=Object.keys(manifest.routes).filter(k=>!baseline.routes[k]);assert.equal(added.length,30);assert.equal(Object.keys(manifest.routes).length,406);for(const route of added)assert.equal(manifest.added_assets[route].activation,'homepage-responsive-image');
});
test('responsive photographs preserve aspect ratio, have actual intrinsic dimensions and smaller mobile variants',async()=>{
 for(const [source,image]of Object.entries(manifest.homepage_delivery.responsive_images)){const srcMeta=await sharp(bytes(source)).metadata();assert.equal(image.width,srcMeta.width);assert.equal(image.height,srcMeta.height);for(const item of image.items){const m=await sharp(bytes(item.route)).metadata();assert.equal(m.width,item.width);assert.equal(m.height,item.height);assert.ok(Math.abs(m.width/m.height-srcMeta.width/srcMeta.height)<0.01);assert.equal(bytes(item.route).length,item.bytes);assert.equal(sha(bytes(item.route)).slice(0,24),item.route.split('/').at(-1).split('.')[0]);}const mobile=image.items[0];assert.ok(mobile.bytes<bytes(source).length,source);assert.ok(html.includes(`${mobile.route} ${mobile.width}w`));}
 const hero=html.match(/<img[^>]*class="es-club-hero__art"[^>]*>/)?.[0];assert.match(hero,/width="1536" height="1024"/);assert.match(hero,/loading="eager" fetchpriority="high"/);assert.match(html,/<div role="listitem" id="pizza-club"/);assert.doesNotMatch(html,/<svg[^>]*(?:width|height)="auto"/);
});
