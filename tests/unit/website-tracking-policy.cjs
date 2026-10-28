const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const policy=loadTs('src/lib/esmeralda-public-host.ts');
const preview=loadTs('src/lib/web-design-preview.ts');
function directives(path){return Object.fromEntries(policy.esmeraldaPublicHeaders(path)['Content-Security-Policy'].split(';').map(x=>x.trim().split(/\s+/)).filter(x=>x[0]).map(([k,...v])=>[k,v]));}
test('website loader/config/beacon destinations are narrowly evidenced',()=>{
 const d=directives('/');
 assert.deepEqual(d['script-src'],["'self'","'unsafe-inline'","'unsafe-eval'",'https://omnisnippet1.com/inshop/launcher-v2.js','https://omnisnippet1.com/forms/main.js','https://connect.facebook.net/en_US/fbevents.js','https://connect.facebook.net/signals/config/773544982454626','https://www.googletagmanager.com']);
 assert.deepEqual(d['connect-src'],["'self'",'https://www.facebook.com/tr/','https://www.googletagmanager.com','https://www.google.com','https://www.google-analytics.com/g/collect','https://region1.google-analytics.com/g/collect','https://wt.omnisendlink.com/REST/inShop/v1/getSettings','https://forms.soundestlink.com/REST/forms/v1/renderedForms','https://forms.soundestlink.com/REST/forms/v1/renderedForms/','https://forms.soundestlink.com/REST/forms/v2/subscribe']);
 for(const endpoint of ['https://www.facebook.com/tr','https://www.facebook.com/tr/','https://www.googletagmanager.com','https://www.google-analytics.com/g/collect','https://region1.google-analytics.com/g/collect'])assert.ok(d['img-src'].includes(endpoint));
 assert.deepEqual(d['form-action'],["'none'"]);
});
test('no guessed wildcard, Ads-specific, debug, unrelated Meta/config or unrelated Omni API permission',()=>{
 const csp=policy.esmeraldaPublicHeaders('/')['Content-Security-Policy'];
 for(const forbidden of ['*','googleadservices.com','doubleclick.net','googlesyndication.com','tagmanager.google.com','tagassistant.google.com','instagram.com','conversionsapigateway.com','signals/plugins/'])assert.ok(!csp.includes(forbidden),forbidden);
 assert.equal(directives('/')['script-src'].filter(x=>x.includes('signals/config/')).length,1);
 assert.ok(!csp.includes('https://api.omnisend.com'));
 assert.ok(!csp.includes('https://pn.soundestlink.com'));
 assert.ok(!csp.includes('REST/webTracking'));
 assert.ok(directives('/')['font-src'].includes('https://fonts.soundestlink.com/fonts/static/'));
 assert.ok(directives('/')['style-src'].includes('https://fonts.soundestlink.com/fonts/css/'));
});
test('preview stays offline/noindex and production still requires release switch',()=>{
 assert.equal(preview.WEB_PREVIEW_HEADERS['X-Robots-Tag'],'noindex, nofollow, noarchive');
 assert.match(preview.WEB_PREVIEW_HEADERS['Content-Security-Policy'],/connect-src 'self'; form-action 'none'; frame-src 'none'/);
 assert.doesNotMatch(preview.WEB_PREVIEW_HEADERS['Content-Security-Policy'],/google|facebook|omni/);
 const old=process.env.ESMERALDA_PUBLIC_ENABLED;delete process.env.ESMERALDA_PUBLIC_ENABLED;assert.equal(policy.esmeraldaPublicEnabled(),false);if(old!==undefined)process.env.ESMERALDA_PUBLIC_ENABLED=old;
});
test('tracking addition preserves route-specific booking/contact and exact public host boundaries',()=>{
 const home=directives('/'),contact=directives('/kontakt'),booking=directives('/bordbooking');
 assert.ok(!home['connect-src'].some(x=>x.includes('supabase')));
 assert.ok(contact['connect-src'].includes('https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/website-contact'));
 assert.ok(booking['connect-src'].includes('https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/booking-api'));
 assert.ok(!booking['connect-src'].some(x=>x.includes('website-contact')));
 assert.ok(contact['script-src'].includes('https://challenges.cloudflare.com/turnstile/v0/api.js'));
 assert.ok(contact['frame-src'].includes('https://www.google.com/maps/embed'));
 for(const h of ['web.orderfly.dk','esmeralda.orderfly.dk','mpanel.esmeraldapizza.dk','www.esmeraldapizza.dk.evil'])assert.equal(policy.isEsmeraldaPublicHost(h),false);
});
