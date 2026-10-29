const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const manifest=require('../../preview/esmeralda/manifest.json');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)))));
test('all104pages use one local consent owner and no eager marketing/Google or noscript pixel',()=>{
 let pages=0,extra=0;
 for(const [route,entry]of Object.entries(payload)){
  if(!entry.file.endsWith('.html'))continue;pages++;
  const html=Buffer.from(entry.data,'base64').toString();
  assert.equal((html.match(/<script src="\/_assets\/website-consent.js"><\/script>/g)||[]).length,1,route);
  assert.doesNotMatch(html,/<noscript>[^]*?www.facebook.com\/tr\?/);
  const scripts=[...html.matchAll(/<script\b[^>]*>[^]*?<\/script>/g)].map(m=>m[0]);
  for(const script of scripts)assert.doesNotMatch(script,/https:\/\/(?:connect.facebook.net|www.googletagmanager.com|omnisnippet1.com)/,route);
  assert.ok(html.includes('function cta()')&&html.includes('function initHero()'),route);
  assert.ok(!html.includes('function initConsent()'),route);
  assert.equal(manifest.page_patches[route].consent_patch_version,1);
  extra+=manifest.page_patches[route].removed_eager_omnisend;
 }
 assert.equal(pages,104);assert.equal(extra,6);
 const newsletter=Buffer.from(payload['/nyhedsbrev'].data,'base64').toString();assert.match(newsletter,/data-newsletter-consent-fallback/);assert.match(newsletter,/Åbn cookieindstillinger/);
 const booking=Buffer.from(payload['/book-bord'].data,'base64').toString();assert.match(booking,/<noscript><p>JavaScript skal være aktiveret/);
});
test('added consent asset pin, disabled contact asset and preserved UI fragment remain explicit',()=>{
 assert.equal(Object.keys(manifest.routes).length,406);
 const bytes=fs.readFileSync('preview/esmeralda/adapters/website-consent.js');
 const sha=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(sha,manifest.added_assets['/_assets/website-consent.js'].sha256);assert.deepEqual(Buffer.from(payload['/_assets/website-consent.js'].data,'base64'),bytes);
 assert.equal(manifest.added_assets['/_assets/website-contact-adapter.js'].activation,'disabled');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync('scripts/website-ui-preserved.html')).digest('hex'),'7b63406575ed90a1f81e462b8b4022a7934fdd930d4d255c7afba4158d89fb4e');
});
