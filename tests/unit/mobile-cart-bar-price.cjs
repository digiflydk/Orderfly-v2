const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
// Reproduces the Esmeralda report: one 95 kr. menu, legacy location fee 49 kr., managed delivery.
let managed=false,deliveryType='delivery',freeDelivery=false;
const mod={exports:{}};
const code=ts.transpileModule(fs.readFileSync('src/components/cart/mobile-floating-cart.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const pass=({children})=>React.createElement(React.Fragment,null,children);
new Function('require','module','exports',code)(name=>{
 if(name==='@/context/cart-context')return {useCart:()=>({itemCount:1,checkoutTotal:deliveryType==='delivery'?(freeDelivery?99:148):99,bagFee:4,deliveryFee:49,freeDeliveryDiscountApplied:freeDelivery,editingItem:null,deliveryType,location:{name:'Esmeralda Pizza Amager'}})};
 if(name==='@/context/delivery-price-context')return {useManagedDeliveryPrice:()=>managed};
 if(name==='@/context/storefront-v2-context')return {useStorefrontV2:()=>true};
 if(name==='@/lib/storefront-format')return {formatPrice:n=>`${n.toFixed(2)} DKK`,itemCountLabel:n=>`${n}`};
 if(name==='@/components/ui/button')return {Button:({asChild,...props})=>React.createElement('button',props)};
 if(name==='@/components/ui/sheet')return {Sheet:pass,SheetTrigger:pass,SheetContent:()=>null,SheetHeader:pass,SheetTitle:pass,SheetDescription:pass};
 if(name==='./cart-contents')return {CartContents:()=>null,CartTotals:()=>null,CartCheckoutButton:()=>null};
 if(name==='lucide-react')return {ShoppingBag:()=>null,Plus:()=>null,ArrowLeft:()=>null};
 return require(name);
},mod,mod.exports);
function render(m,type,free=false){managed=m;deliveryType=type;freeDelivery=free;return renderToStaticMarkup(React.createElement(mod.exports.MobileFloatingCart));}
test('managed delivery bar matches the cart and never adds the legacy fee',()=>{const html=render(true,'delivery');assert.match(html,/Se kurv · 1/);assert.match(html,/95.00 DKK/);assert.doesNotMatch(html,/144.00 DKK/);});
test('managed delivery with free delivery still shows items only',()=>{const html=render(true,'delivery',true);assert.match(html,/95.00 DKK/);});
test('legacy delivery keeps its configured fee in the bar',()=>{const html=render(false,'delivery');assert.match(html,/144.00 DKK/);});
test('pickup at a managed location shows items only',()=>{const html=render(true,'pickup');assert.match(html,/95.00 DKK/);assert.doesNotMatch(html,/144.00 DKK/);});
