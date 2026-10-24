const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/[brandSlug]/club/login/checkout-return.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports});
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
