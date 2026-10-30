// Production ProductDialog with synthetic catalog; no real orders or server writes.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin;
function file(name,code){const target=path.join(dir,name+'.js');fs.writeFileSync(target,code);return target;}
const product={id:'pizza',productName:'Testpizza',brandId:'b',locationIds:['l'],isActive:true,categoryId:'pizza',price:75,toppingGroupIds:['extras','removals','drink'],toppingOverrides:{cheese:{price:5,isDefault:true,defaultQuantity:2},onion:{isAvailable:true},cola:{price:0}}};
const groups=[{id:'extras',groupName:'Internal extras',displayName:'Ekstra tilbehør',locationIds:['l'],minSelection:0,maxSelection:3},{id:'removals',kind:'removal',groupName:'Internal removals',displayName:'Fjern ingredienser',locationIds:['l'],minSelection:0,maxSelection:0},{id:'drink',groupName:'Drink',displayName:'Drikkevare',selectionMode:'single',locationIds:['l'],minSelection:1,maxSelection:2}];
const toppings=[{id:'cheese',groupId:'extras',toppingName:'Ost',price:10,maxQuantity:3,isActive:true,locationIds:['l']},{id:'onion',groupId:'removals',toppingName:'løg',price:0,isActive:true,locationIds:['l']},{id:'cola',groupId:'drink',toppingName:'Cola',price:20,maxQuantity:2,isActive:true,locationIds:['l']},{id:'water',groupId:'drink',toppingName:'Vand',price:10,maxQuantity:2,isActive:true,locationIds:['l']}];
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'tilvalg-storefront-browser-'));
 const entry=file('entry',`import React,{useState}from'react';import{createRoot}from'react-dom/client';
 import{StorefrontV2Provider}from ${JSON.stringify(path.join(root,'src/context/storefront-v2-context.tsx'))};
 import{ComboBuilderDialog}from ${JSON.stringify(path.join(root,'src/components/product/combo-builder-dialog.tsx'))};
 const product=${JSON.stringify(product)};
 const combo={id:'combo',brandId:'b',comboName:'Testmenu',pickupPrice:100,productGroups:[{id:'main',groupName:'Pizza',productIds:['pizza'],minSelection:1,maxSelection:1,productPriceAdjustments:location.search.includes('surcharge')?{pizza:15}:undefined}]};
 if(location.search.includes('twopizzas'))combo.productGroups.push({id:'second',groupName:'Pizza 2',productIds:['pizza'],minSelection:1,maxSelection:1,productPriceAdjustments:{pizza:15}});
 if(location.search.includes('optional'))combo.productGroups.push({id:'optional',groupName:'Ekstra pizza',productIds:['pizza'],minSelection:0,maxSelection:1,productPriceAdjustments:{pizza:15}});
 function App(){const[open,setOpen]=useState(true),[initialItem,setInitialItem]=useState();return <><button onClick={()=>{setInitialItem(window.saved);setOpen(true);}}>Rediger gemt</button>{open&&<ComboBuilderDialog combo={combo} brandProducts={[product]} initialItem={initialItem} initialQuantity={2} preselectedProductId={initialItem?undefined:'pizza'} preselectedModifiers={location.search.includes('legacy')?undefined:[{id:'cheese',quantity:2},{id:'onion',quantity:1}]} isOpen={open} setIsOpen={setOpen}/>}</>};createRoot(document.getElementById('root')).render(<StorefrontV2Provider enabled={location.search.includes('v2')}><App/></StorefrontV2Provider>);`);
 const loader=file('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const cart=file('cart',`const value={cartReady:true,deliveryType:'pickup',location:{id:'l'},cartTotal:0,addComboToCart:(combo,quantity,comboSelections,price,expected,toppings)=>{window.saved={id:combo.id,cartItemId:'saved',itemType:'combo',productName:combo.comboName,brandId:combo.brandId,quantity,comboSelections,price,basePrice:price,toppings};return true;}};export const useCart=()=>value;`);
 const aliases={
  '@/context/cart-context':cart,
  '@/context/storefront-catalog':file('catalog',`const data={products:[${JSON.stringify(product)}],combos:new URLSearchParams(location.search).has('upgrade')?[{id:'test-combo',comboName:'Testmenu',pickupPrice:100,upgradeProductIds:['pizza'],productGroups:[{groupName:'Pizza',productIds:['pizza']}]}]:[]};export const useStorefrontCatalog=()=>data;`),
  '@/context/analytics-context':file('analytics',`const trackEvent=()=>false;export const useAnalytics=()=>({trackEvent,measurementKey:'test'});`),
  '@/hooks/use-toast':file('toast','const toast=()=>{};export const useToast=()=>({toast});'),
  '@/lib/public-read':file('public-read',`export const publicRead=async()=>{if(location.search.includes('failure'))throw Error('offline');return {groups:${JSON.stringify(groups)},toppings:${JSON.stringify(toppings)}};`),
  '@/components/product/combo-builder-dialog':file('combo',`export const ComboBuilderDialog=()=>null;`),
  'next/image':file('image',`import React from'react';export default function Image({fill,priority,...props}){return <img {...props} src="/product.svg" style={fill?{position:'absolute',width:'100%',height:'100%',objectFit:'cover'}:undefined}/>;}`),
  'next/link':file('link',`import React from'react';export default function Link(props){return <a {...props}/>;}`),
  'react$':require.resolve('next/dist/compiled/react'),
  'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),
  'react-dom$':require.resolve('next/dist/compiled/react-dom'),
  'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client'),
  '@':path.join(root,'src'),
 };
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},

  resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/tilvalg-storefront-browser-.*\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 execFileSync(path.join(root,'node_modules/.bin/tailwindcss'),['-c',path.join(root,'tailwind.config.ts'),'-i',path.join(root,'src/app/globals.css'),'-o',path.join(dir,'styles.css'),'--minify'],{cwd:root,stdio:'pipe'});
 let styles=fs.readFileSync(path.join(dir,'styles.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/styles/commerce-ui.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/styles/storefront-v2.css'),'utf8');
 const fontDir=process.env.TILVALG_FONT_DIR;
 if(fontDir) styles+="@font-face{font-family:'Bourton Base';src:url('/heading.woff2')}@font-face{font-family:'Brandon Text Office Regular';src:url('/body.ttf')}";
 server=http.createServer((req,res)=>{if(req.url==='/product.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#28231b"/><circle cx="32" cy="32" r="25" fill="#c99950"/><circle cx="32" cy="32" r="21" fill="#f0cc78"/><g fill="#a94c37"><circle cx="23" cy="23" r="5"/><circle cx="40" cy="25" r="5"/><circle cx="31" cy="42" r="5"/></g></svg>');}if(fontDir&&['/heading.woff2','/body.ttf'].includes(req.url)){res.setHeader('content-type',req.url.endsWith('.woff2')?'font/woff2':'font/ttf');return res.end(fs.readFileSync(path.join(fontDir,req.url.slice(1))));}if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return res.end(styles);}if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');res.end(fs.readFileSync(path.join(dir,'bundle.js')));}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div data-commerce-root data-brand-slug="esmeralda" id="root"'+(new URL(req.url,'http://localhost').searchParams.has('v2')?' data-storefront-version="2"':'')+'></div><script src="/bundle.js"></script></body></html>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
for(const width of [390,1280])test(`combo retains and edits upgraded modifiers with required validation (${width}px)`,async t=>{
 const context=await browser.newContext({viewport:{width,height:950}});t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(7000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 await page.getByRole('heading',{name:'Tilvalg til Testpizza',exact:true}).waitFor();
 assert.equal(await page.getByLabel('Valgt antal Ost',{exact:true}).innerText(),'2');
 assert.equal(await page.getByRole('checkbox',{name:'Uden løg',exact:true}).isChecked(),true);
 await page.getByRole('button',{name:/Vælg de påkrævede tilvalg/}).click();assert.equal(await page.evaluate(()=>window.saved),undefined);
 assert.equal(await page.getByRole('alert').first().isVisible(),true);
 await page.getByRole('radio',{name:'Vand',exact:true}).check();
 assert.match(await page.getByRole('button',{name:/Tilføj til kurv/}).innerText(),/240/);
 await page.getByRole('button',{name:/Tilføj til kurv/}).click();
 let saved=await page.evaluate(()=>window.saved);assert.equal(saved.quantity,2);assert.equal(saved.price,100);assert.equal(saved.toppings.reduce((n,t)=>n+t.price,0),20);
 assert.deepEqual(saved.comboSelections[0].products[0].modifiers,[{id:'cheese',quantity:2},{id:'onion',quantity:1},{id:'water',quantity:1}]);
 await page.getByRole('button',{name:'Rediger gemt',exact:true}).click();
 assert.equal(await page.getByLabel('Valgt antal Ost',{exact:true}).innerText(),'2');assert.equal(await page.getByRole('radio',{name:'Vand',exact:true}).isChecked(),true);
 await page.getByRole('button',{name:'Flere Ost',exact:true}).click();
 await page.getByRole('button',{name:/Gem ændringer/}).click();
 saved=await page.evaluate(()=>window.saved);assert.equal(saved.comboSelections[0].products[0].modifiers.find(m=>m.id==='cheese').quantity,3);assert.equal(saved.toppings.reduce((n,t)=>n+t.price,0),25);
 assert.deepEqual(errors,[]);
});
test('combo cannot be submitted when options fail to load',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());await page.goto(origin+'/?failure');await page.getByText('Tilvalg kunne ikke indlæses.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Tilføj til kurv/}).isDisabled(),true);assert.equal(await page.evaluate(()=>window.saved),undefined);
});
test('V1 plain combo ignores paid defaults and product required groups',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());await page.goto(origin+'/?legacy');
 const add=page.getByRole('button',{name:/Tilføj til kurv/});await add.waitFor();await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Tilføj til kurv')&&!b.disabled));
 assert.equal(await page.getByRole('heading',{name:'Tilvalg til Testpizza',exact:true}).count(),0);
 assert.match(await add.innerText(),/200/);await add.click();
 const saved=await page.evaluate(()=>window.saved);assert.deepEqual(saved.toppings,[]);assert.equal(saved.price,100);
 assert.equal(Object.hasOwn(saved.comboSelections[0].products[0],'modifiers'),false);
});

test('V2 combo surcharge stays separate from modifiers, restores on edit and total remains at bottom',async t=>{
 const page=await browser.newPage({viewport:{width:320,height:844}});t.after(()=>page.close());await page.goto(origin+'/?v2&surcharge');
 await page.getByRole('heading',{name:'Tilvalg til Testpizza',exact:true}).waitFor();
 assert.equal(await page.getByText('+15,00 kr.',{exact:true}).count(),1);
 assert.equal(await page.locator('.commerce-option-header').getByText('100,00 kr.',{exact:true}).count(),0);
 await page.getByRole('radio',{name:'Vand',exact:true}).check();
 const add=page.getByRole('button',{name:/Tilføj til kurv/});assert.match(await add.innerText(),/270/);
 const bounds=await add.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=845);
 await add.click();let saved=await page.evaluate(()=>window.saved);assert.equal(saved.price,115);assert.equal(saved.toppings.reduce((n,t)=>n+t.price,0),20);
 await page.getByRole('button',{name:'Rediger gemt',exact:true}).click();
 assert.match(await page.getByRole('button',{name:/Gem ændringer/}).innerText(),/270/);
 await page.getByRole('button',{name:/Gem ændringer/}).click();saved=await page.evaluate(()=>window.saved);assert.equal(saved.price,115);
});

test('same dish in two combo groups keeps independent modifiers and group surcharges',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());await page.goto(origin+'/?v2&twopizzas');
 const choices=page.getByRole('region',{name:'Tilvalg til Testpizza',exact:true});await choices.nth(1).waitFor();
 await choices.nth(0).getByRole('radio',{name:'Vand',exact:true}).check();
 await choices.nth(1).getByRole('radio',{name:'Cola',exact:true}).check();
 await page.getByRole('button',{name:/Tilføj til kurv/}).click();
 const saved=await page.evaluate(()=>window.saved);assert.equal(saved.price,115);assert.equal(saved.comboSelections.length,2);
 assert.ok(saved.comboSelections[0].products[0].modifiers.some(m=>m.id==='water'));
 assert.ok(saved.comboSelections[1].products[0].modifiers.some(m=>m.id==='cola'));
 assert.equal(saved.comboSelections[1].products[0].modifiers.some(m=>m.id==='water'),false);
});
test('optional combo group can be cleared without retaining its surcharge',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());await page.goto(origin+'/?v2&optional');
 const optional=page.getByRole('region',{name:'Ekstra pizza',exact:true});await optional.waitFor();
 await optional.getByRole('radio',{name:/Testpizza/}).check();
 await optional.getByRole('radio',{name:'Ingen tak',exact:true}).check();
 await page.getByRole('radio',{name:'Vand',exact:true}).check();
 assert.match(await page.getByRole('button',{name:/Tilføj til kurv/}).innerText(),/240/);
 await page.getByRole('button',{name:/Tilføj til kurv/}).click();const saved=await page.evaluate(()=>window.saved);
 assert.equal(saved.price,100);assert.deepEqual(saved.comboSelections.find(g=>g.groupId==='optional').products,[]);
});
