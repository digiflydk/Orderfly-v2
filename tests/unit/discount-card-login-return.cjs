const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
// Load the actual pure host helper, while rejecting any unexpected dependency.
const host={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/esmeralda-v2-host.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:host,exports:host.exports});
const routes={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/brand-subdomain.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:routes,exports:routes.exports,require:name=>{assert.equal(name,'./esmeralda-v2-host');return host.exports;}});
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/[brandSlug]/club/login/checkout-return.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,require:name=>{assert.equal(name,'@/lib/brand-subdomain');return routes.exports;}});
const {safeCheckoutReturn:valid,readCheckoutReturn:read,checkoutReturnKey:key}=m.exports;
test('only same-brand relative checkout paths allowed',()=>{
 assert.equal(valid('/amager/checkout','esmeralda','/club'),'/amager/checkout');
 assert.equal(valid('/esmeralda/amager/checkout','esmeralda','/esmeralda/club'),'/esmeralda/amager/checkout');
 for(const p of ['https://evil.test/amager/checkout','//evil.test/checkout','/other/amager/checkout','/amager/checkout?next=x','/amager/checkout#x','/../amager/checkout','/amager%2fcheckout','/amager\\checkout','/superadmin','/amager/checkout/'])assert.equal(valid(p,'esmeralda','/club'),null,p);
 assert.equal(valid('/other/amager/checkout','esmeralda','/esmeralda/club'),null);
});
test('stored navigation expires and is revalidated, never crosses brand key',()=>{
 const map=new Map(),store={getItem:k=>map.get(k),removeItem:k=>map.delete(k)};
 map.set(key('esmeralda'),JSON.stringify({path:'/amager/checkout',expiresAt:2000}));assert.equal(read(store,'esmeralda','/club',1000),'/amager/checkout');assert.equal(read(store,'other','/club',1000),null);
 assert.equal(read(store,'esmeralda','/club',2000),null);
 for(const value of ['broken',JSON.stringify({path:'//evil.test/checkout',expiresAt:2000}),JSON.stringify({path:'/amager/checkout',expiresAt:999999999})]){map.set(key('esmeralda'),value);assert.equal(read(store,'esmeralda','/club',1000),null);}
});

test('all storefront checkout route classes roundtrip, including canonical long forms',()=>{
 for(const location of ['amager','esmeralda','feedback','games','tracking','admin-login','superadmin','merchant','verify','api'])for(const canonical of [true,false]){
  const target=routes.exports.storefrontPath('esmeralda',canonical,location,'checkout');
  assert.equal(valid(target,'esmeralda',canonical?'/club':'/esmeralda/club'),target,target);
 }
 for(const p of ['/feedback/checkout','/esmeralda/checkout','/other/feedback/checkout','/esmeralda/feedback/checkout?x=1','/esmeralda/../checkout'])assert.equal(valid(p,'esmeralda','/club'),null,p);
});

test('V2 presentation alias keeps the existing brand checkout return boundary',()=>{
 const brand=routes.exports.brandSlugFromHost('esmeralda2.orderfly.dk');
 assert.equal(brand,'esmeralda');
 const target=routes.exports.storefrontPath(brand,true,'amager','checkout');
 assert.equal(valid(target,brand,'/club'),'/amager/checkout');
 assert.equal(valid('/other/amager/checkout',brand,'/club'),null);
 assert.equal(valid('/esmeralda2/amager/checkout',brand,'/club'),null);
});
