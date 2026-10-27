const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {loadTs}=require('../helpers/load-ts.cjs');
const attribution=loadTs('src/lib/delivery/routing/attribution.ts');
const {deliveryRoutingAttribution}=attribution;
const mod={exports:{}};
const code=ts.transpileModule(fs.readFileSync('src/components/checkout/managed-delivery-quote.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('require','module','exports',code)(name=>{
  if(name==='@/lib/delivery/routing/attribution')return attribution;
  if(name==='@/lib/checkout-public-error')return loadTs('src/lib/checkout-public-error.ts');
  if(name==='@/components/ui/button')return {Button:({variant,...props})=>React.createElement('button',props)};
  return require(name);
},mod,mod.exports);
const {ManagedDeliveryQuote}=mod.exports;
const quote={quoteId:'q',quoteToken:'token',checkoutFingerprint:'fingerprint',customerFeeMinor:3500,checkoutTotalMinor:13500,currency:'DKK',expiresAtMs:Date.now()+60000,deliveryInterval:null};
function render(q=quote,enabled=true){return renderToStaticMarkup(React.createElement(ManagedDeliveryQuote,{enabled,state:{kind:'ready',quote:q},checkoutFingerprint:'fingerprint',accepted:null,onRequest(){},onAccept(){},onPickup(){}}));}
test('persisted source derives fixed Geoapify and OpenStreetMap attribution',()=>{
 const persisted=JSON.parse(JSON.stringify({economics:{route:{source:'geoapify'}}}));
 assert.deepEqual(deliveryRoutingAttribution(persisted.economics.route.source),{providerLabel:'Powered by Geoapify',providerUrl:'https://www.geoapify.com/',dataLabel:'© OpenStreetMap contributors',dataUrl:'https://www.openstreetmap.org/copyright'});
 assert.equal(Object.isFrozen(deliveryRoutingAttribution('geoapify')),true);
});
test('unknown sources and provider-controlled HTML or URLs cannot become attribution',()=>{
 for(const source of [undefined,null,'google_maps','Geoapify','geoapify ', 'javascript:alert(1)','<img src=x onerror=alert(1)>',{source:'geoapify',providerUrl:'javascript:alert(1)'},['geoapify']])assert.equal(deliveryRoutingAttribution(source),null);
});
test('actual quote component places fixed linked attribution by quote information',()=>{
 const html=render({...quote,routingSource:'geoapify'});
 assert.match(html,/href="https:\/\/www.geoapify.com\/"[^>]*>Powered by Geoapify<\/a> \| <a[^>]*href="https:\/\/www.openstreetmap.org\/copyright"[^>]*>© OpenStreetMap contributors<\/a>/);
 assert.ok(html.indexOf('Powered by Geoapify')>html.indexOf('Leveringstidspunktet er endnu ikke oplyst.'));
 assert.ok(html.indexOf('Powered by Geoapify')<html.indexOf('Jeg accepterer leveringsprisen'));
});
test('legacy unknown disabled and expired quote views do not invent attribution',()=>{
 for(const q of [quote,{...quote,routingSource:'unknown'},{...quote,routingSource:'<script>alert(1)</script>'},{...quote,routingSource:'geoapify',expiresAtMs:1}]){
  const html=render(q);assert.doesNotMatch(html,/Powered by Geoapify|OpenStreetMap|<script>/);
 }
 assert.equal(render({...quote,routingSource:'geoapify'},false),'');
});
