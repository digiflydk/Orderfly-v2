const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const parts=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)));
const payload=JSON.parse(zlib.gunzipSync(parts)),manifest=require('../../preview/esmeralda/manifest.json');
test('initial HTML reflects existing Club then brunch campaign ordering with prioritized first image',()=>{
 const html=Buffer.from(payload['/'].data,'base64').toString();
 const carousel=html.slice(html.indexOf('class="swiper-container'),html.indexOf('class="swiper-button-prev'));
 assert.ok(carousel.indexOf('id="pizza-club"')<carousel.indexOf('Weekendsbrunch hos Esmeralda'));
 assert.match(carousel,/<img[^>]*loading="eager" fetchpriority="high"[^>]*class="es-club-hero__art"/);
 assert.equal((html.match(/id="pizza-club"/g)||[]).length,1);
 assert.match(html,/autoplay:false/);assert.doesNotMatch(html,/if\(list&&list.firstElementChild!==slide\)list.insertBefore/);
 assert.match(html,/swiper-button-next[^}]*width:44px;height:44px/);
});
test('all104local consent forms avoid legacy CAPTCHA and every payload hash remains pinned',()=>{
 assert.equal(crypto.createHash('sha256').update(parts).digest('hex'),manifest.payload_sha256);
 let pages=0;for(const [path,entry]of Object.entries(payload)){
  const bytes=Buffer.from(entry.data,'base64');assert.equal(bytes.length,manifest.routes[path].size,path);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.routes[path].sha256,path);
  if(entry.file.endsWith('.html')){pages++;assert.doesNotMatch(bytes.toString(),/<form\b[^>]*class="flowappz-cookie-settings-form-wrapper"[^>]*data-turnstile-sitekey/);}
 }assert.equal(pages,104);
 const contact=Buffer.from(payload['/_assets/website-contact-adapter.js'].data,'base64').toString();assert.match(contact,/window.turnstile.render/);
});
