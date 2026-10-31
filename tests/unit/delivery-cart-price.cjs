const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
let managed=false,deliveryType='delivery';
const mod={exports:{}};
const code=ts.transpileModule(fs.readFileSync('src/components/cart/cart-contents.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('require','module','exports',code)(name=>{
 if(name==='@/context/cart-context')return {useCart:()=>({subtotal:158,itemDiscount:0,checkoutTotal:deliveryType==='delivery'?211:162,bagFee:4,deliveryType,deliveryFee:49,adminFee:0,location:{minOrder:100}})};
 if(name==='@/context/delivery-price-context')return {useManagedDeliveryPrice:()=>managed};
 if(name==='@/lib/storefront-format')return {formatPrice:n=>`${n.toFixed(2)} DKK`};
 if(name==='@/components/ui/button')return {Button:props=>React.createElement('button',props)};
 if(name==='@/hooks/use-menu-checkout')return {};
 if(name==='@/lib/images')return {};
 if(name==='@/components/product/inline-upsell')return {};
 if(name==='@/components/product/storefront-product-image')return {StorefrontProductImage:()=>null};
 if(name==='@/context/storefront-v2-context')return {useStorefrontV2:()=>false};
 return require(name);
},mod,mod.exports);
function render(m,type){managed=m;deliveryType=type;return renderToStaticMarkup(React.createElement(mod.exports.CartTotals));}
test('managed delivery leaves price pending and never totals the legacy fee',()=>{const html=render(true,'delivery');assert.match(html,/158.00 DKK/);assert.match(html,/Beregnes i kassen/);assert.match(html,/Afventer leveringspris/);assert.doesNotMatch(html,/49.00 DKK|207.00 DKK/);});
test('legacy delivery keeps its configured fee and subtotal',()=>{const html=render(false,'delivery');assert.match(html,/49.00 DKK/);assert.match(html,/207.00 DKK/);assert.doesNotMatch(html,/Afventer leveringspris/);});
test('pickup remains priced even at a managed location',()=>{const html=render(true,'pickup');assert.match(html,/158.00 DKK/);assert.doesNotMatch(html,/Beregnes i kassen|Afventer leveringspris|49.00 DKK/);});
