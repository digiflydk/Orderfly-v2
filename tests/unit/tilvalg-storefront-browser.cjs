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
 import{ProductDialog}from ${JSON.stringify(path.join(root,'src/components/product/product-dialog.tsx'))};
 const product=${JSON.stringify(product)},groups=${JSON.stringify(groups)},toppings=${JSON.stringify(toppings)};
 if(location.search.includes('long')){product.toppingGroupIds.push('sauces','side');product.toppingGroupConditions={side:['sauce12']};groups.push({id:'side',groupName:'Tilbehør til sauce',minSelection:1,maxSelection:1,locationIds:['l']});toppings.push({id:'side1',groupId:'side',toppingName:'Brød',price:0,isActive:true,locationIds:['l']});groups.push({id:'sauces',groupName:'Saucer',minSelection:0,maxSelection:1,locationIds:['l']});for(let n=1;n<=12;n++)toppings.push({id:'sauce'+n,groupId:'sauces',toppingName:'Sauce '+n,price:n,isActive:true,locationIds:['l']});}
 function App(){const[open,setOpen]=useState(true);const[initialItem,setInitialItem]=useState();return <><button onClick={()=>{setInitialItem(window.saved?{...window.saved,id:product.id,cartItemId:'saved',itemType:'product',productName:product.productName,brandId:product.brandId,price:75,itemTotal:75}:undefined);setOpen(true);}}>Rediger gemt</button><ProductDialog product={product} initialItem={initialItem} allToppingGroups={groups} allToppings={toppings} isOpen={open} setIsOpen={setOpen}/></>};createRoot(document.getElementById('root')).render(<App/>);`);
 const loader=file('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const cart=file('cart',`const value={cartReady:true,deliveryType:'pickup',location:{id:'l'},cartTotal:0,addToCart:(product,quantity,toppings,basePrice,finalPrice)=>{window.saved={productId:product.id,quantity,toppings,basePrice,finalPrice};return true;}};export const useCart=()=>value;`);
 const aliases={
  '@/context/cart-context':cart,
  '@/context/storefront-catalog':file('catalog',`const data={products:[${JSON.stringify(product)}],combos:[]};export const useStorefrontCatalog=()=>data;`),
  '@/context/analytics-context':file('analytics',`const trackEvent=()=>false;export const useAnalytics=()=>({trackEvent,measurementKey:'test'});`),
  '@/hooks/use-toast':file('toast','const toast=()=>{};export const useToast=()=>({toast});'),
  '@/lib/public-read':file('public-read',`export const publicRead=async()=>[];`),
  '@/components/product/combo-builder-dialog':file('combo',`export const ComboBuilderDialog=()=>null;`),
  'next/image':file('image',`import React from'react';export default function Image({fill,priority,...props}){return <img {...props}/>;}`),
  'next/link':file('link',`import React from'react';export default function Link(props){return <a {...props}/>;}`),
  'react$':require.resolve('next/dist/compiled/react'),
  'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),
  'react-dom$':require.resolve('next/dist/compiled/react-dom'),
  'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client'),
  '@':path.join(root,'src'),
 };
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},
  plugins:[new webpackModule.webpack.NormalModuleReplacementPlugin(/^\.\/combo-builder-dialog$/,resource=>{resource.request=aliases['@/components/product/combo-builder-dialog'];})],
  resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/tilvalg-storefront-browser-.*\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 execFileSync(path.join(root,'node_modules/.bin/tailwindcss'),['-c',path.join(root,'tailwind.config.ts'),'-i',path.join(root,'src/app/globals.css'),'-o',path.join(dir,'styles.css'),'--minify'],{cwd:root,stdio:'pipe'});
 const styles=fs.readFileSync(path.join(dir,'styles.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/styles/commerce-ui.css'),'utf8');
 server=http.createServer((req,res)=>{if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return res.end(styles);}if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');res.end(fs.readFileSync(path.join(dir,'bundle.js')));}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div data-commerce-root data-brand-slug="esmeralda" id="root"></div><script src="/bundle.js"></script></body></html>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
for(const width of [390,1280])test(`quantity, product-specific price/default, removal and limits (${width}px)`,async t=>{
 const context=await browser.newContext({viewport:{width,height:1000}});t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(7000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 await page.getByRole('heading',{name:'Testpizza',exact:true}).waitFor();
 assert.deepEqual(await page.getByRole('heading',{level:3}).allTextContents(),['Drikkevare','Ekstra tilbehør','Fjern ingredienser']);
 assert.equal(await page.getByRole('button',{name:'Ekstra tilbehør',exact:true}).getAttribute('aria-expanded'),'false');
 await page.getByRole('button',{name:'Ekstra tilbehør',exact:true}).click();
 await page.getByRole('button',{name:'Fjern ingredienser',exact:true}).click();
 assert.equal(await page.getByLabel('Valgt antal Ost',{exact:true}).innerText(),'2');
 assert.equal(await page.getByRole('checkbox',{name:'Uden løg',exact:true}).isChecked(),false);
 // Required drink prevents submission, and quantity limits affect actual controls.
 await page.getByRole('button',{name:/Vælg de påkrævede tilvalg/}).click();assert.equal(await page.evaluate(()=>window.saved),undefined);
 await page.getByRole('button',{name:'Flere Ost',exact:true}).click();assert.equal(await page.getByLabel('Valgt antal Ost',{exact:true}).innerText(),'3');
 assert.equal(await page.getByRole('button',{name:'Flere Ost',exact:true}).isEnabled(),false);
 await page.getByRole('checkbox',{name:'Uden løg',exact:true}).check();
 await page.getByRole('radio',{name:'Cola',exact:true}).check();
 await page.getByRole('button',{name:'Flere Cola',exact:true}).click();
 await page.getByRole('radio',{name:'Vand',exact:true}).check();
 assert.equal(await page.getByRole('radio',{name:'Cola',exact:true}).isChecked(),false);
 await page.getByRole('radio',{name:'Cola',exact:true}).check();
 await page.getByRole('button',{name:/Tilføj til kurv/}).click();
 const saved=await page.evaluate(()=>window.saved);
 assert.equal(saved.finalPrice,75);assert.equal(saved.toppings.find(t=>t.id==='cheese').price,15);assert.equal(saved.toppings.find(t=>t.id==='cheese').quantity,3);
 assert.equal(saved.toppings.find(t=>t.id==='onion').name,'Uden løg');assert.equal(saved.toppings.find(t=>t.id==='onion').price,0);assert.equal(saved.toppings.find(t=>t.id==='cola').price,0);
 // Editing reopens the exact quantity/removal selection, not new defaults.
 await page.getByRole('button',{name:'Rediger gemt',exact:true}).click();
 await page.getByRole('button',{name:'Ekstra tilbehør',exact:true}).click();
 await page.getByRole('button',{name:'Fjern ingredienser',exact:true}).click();
 assert.equal(await page.getByLabel('Valgt antal Ost',{exact:true}).innerText(),'3');
 assert.equal(await page.getByRole('checkbox',{name:'Uden løg',exact:true}).isChecked(),true);
 await page.getByRole('checkbox',{name:'Ost',exact:true}).uncheck();
 await page.getByRole('radio',{name:'Vand',exact:true}).check();
 assert.equal(await page.getByRole('checkbox',{name:'Ost',exact:true}).isChecked(),false);
 await page.getByRole('button',{name:/Gem ændringer/}).click();
 assert.equal((await page.evaluate(()=>window.saved)).toppings.some(t=>t.id==='cheese'),false);
 assert.deepEqual(errors,[]);
});

for(const width of [390,1280])test(`required progress, keyboard single choice and searchable optional groups (${width}px)`,async t=>{
 const context=await browser.newContext({viewport:{width,height:850},reducedMotion:'reduce'});t.after(()=>context.close());
 const page=await context.newPage();page.setDefaultTimeout(7000);await page.goto(origin+'/?long');
 const panel=page.getByRole('dialog');await panel.waitFor();
 if(process.env.TILVALG_SCREENSHOT_DIR){fs.mkdirSync(process.env.TILVALG_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.TILVALG_SCREENSHOT_DIR,`storefront-initial-${width}.png`),fullPage:true});}
 assert.equal(await page.getByRole('button',{name:'Saucer',exact:true}).getAttribute('aria-expanded'),'false');
 await page.getByRole('button',{name:/Vælg de påkrævede tilvalg/}).click();
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-invalid')),'true');
 assert.equal(await page.getByRole('status',{name:'Valgstatus'}).textContent(),'0 af 1 påkrævede grupper valgt');
 const cola=page.getByRole('radio',{name:'Cola',exact:true});await cola.focus();await cola.press('Space');await cola.press('ArrowRight');
 assert.equal(await page.getByRole('radio',{name:'Vand',exact:true}).isChecked(),true);
 assert.equal(await page.getByRole('status',{name:'Valgstatus'}).textContent(),'1 af 1 påkrævede grupper valgt');
 await page.getByRole('button',{name:'Saucer',exact:true}).click();
 const sauces=page.getByRole('radiogroup',{name:'Saucer',exact:true});
 assert.equal(await sauces.getByRole('radio').count(),7); // Six choices plus explicit Ingen.
 assert.equal(await sauces.getByRole('radio',{name:'Ingen',exact:true}).isChecked(),true);
 await page.getByRole('button',{name:'Vis alle (12)',exact:true}).click();assert.equal(await sauces.getByRole('radio').count(),13);
 await sauces.getByRole('radio',{name:'Sauce 12',exact:true}).check();
 assert.deepEqual((await page.getByRole('heading',{level:3}).allTextContents()).slice(0,2),['Drikkevare','Tilbehør til sauce']);
 await page.getByRole('button',{name:/Vælg de påkrævede tilvalg/}).click();
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-labelledby')?.endsWith('-heading-side')),true);
 assert.equal(await page.getByRole('radio',{name:'Brød',exact:true}).isVisible(),true);
 await page.getByRole('radio',{name:'Brød',exact:true}).check();
 await page.getByRole('button',{name:'Vis færre',exact:true}).click();assert.equal(await sauces.getByRole('radio',{name:'Sauce 12',exact:true}).isVisible(),true);
 await page.getByRole('textbox',{name:'Søg i Saucer',exact:true}).fill('Sauce 3');
 assert.equal(await sauces.getByRole('radio',{name:'Sauce 12',exact:true}).isVisible(),true);
 assert.equal(await sauces.getByRole('radio',{name:'Sauce 3',exact:true}).isVisible(),true);
 await page.getByRole('button',{name:'Saucer',exact:true}).click();
 const section=page.getByRole('region',{name:'Saucer',exact:true});assert.match(await section.innerText(),/Sauce 12/);
 await page.getByRole('button',{name:'Saucer',exact:true}).click();await sauces.getByRole('radio',{name:'Ingen',exact:true}).check();
 await page.getByRole('button',{name:'Saucer',exact:true}).click();
 assert.match(await section.innerText(),/Ingen valgt/);
 assert.equal(await page.getByRole('heading',{name:'Tilbehør til sauce',exact:true}).count(),0);
 await page.getByRole('button',{name:'Ekstra tilbehør',exact:true}).click();
 const stepper=await page.getByRole('button',{name:'Flere Ost',exact:true}).boundingBox();assert.ok(stepper.width>=44&&stepper.height>=44);
 assert.equal(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 const submit=page.getByRole('button',{name:/Tilføj til kurv/});const box=await submit.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=850);
 if(process.env.TILVALG_SCREENSHOT_DIR){fs.mkdirSync(process.env.TILVALG_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.TILVALG_SCREENSHOT_DIR,`storefront-options-${width}.png`),fullPage:true});}
 await submit.click();const saved=await page.evaluate(()=>window.saved);assert.equal(saved.toppings.some(option=>option.id.startsWith('sauce')||option.id==='side1'),false);
});
