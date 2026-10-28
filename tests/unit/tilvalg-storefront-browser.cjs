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
 if(location.search.includes('compact')){product.toppingGroupIds=['extras','removals'];product.toppingOverrides={};}
 if(location.search.includes('wide')){product.productName='Pizza med ekstra mozzarella, grøntsager og friske krydderurter';product.price=12345.5;product.description='En fyldig pizza med grøntsager og frisk mozzarella. '.repeat(8);toppings[0].toppingName='Ekstra frisk mozzarella og grillede grøntsager';}
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
  'next/image':file('image',`import React from'react';export default function Image({fill,priority,...props}){return <img {...props} src="/product.svg" style={fill?{position:'absolute',width:'100%',height:'100%',objectFit:'cover'}:undefined}/>;}`),
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
 let styles=fs.readFileSync(path.join(dir,'styles.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/styles/commerce-ui.css'),'utf8');
 const fontDir=process.env.TILVALG_FONT_DIR;
 if(fontDir) styles+="@font-face{font-family:'Bourton Base';src:url('/heading.woff2')}@font-face{font-family:'Brandon Text Office Regular';src:url('/body.ttf')}";
 server=http.createServer((req,res)=>{if(req.url==='/product.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#28231b"/><circle cx="32" cy="32" r="25" fill="#c99950"/><circle cx="32" cy="32" r="21" fill="#f0cc78"/><g fill="#a94c37"><circle cx="23" cy="23" r="5"/><circle cx="40" cy="25" r="5"/><circle cx="31" cy="42" r="5"/></g></svg>');}if(fontDir&&['/heading.woff2','/body.ttf'].includes(req.url)){res.setHeader('content-type',req.url.endsWith('.woff2')?'font/woff2':'font/ttf');return res.end(fs.readFileSync(path.join(fontDir,req.url.slice(1))));}if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return res.end(styles);}if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');res.end(fs.readFileSync(path.join(dir,'bundle.js')));}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div data-commerce-root data-brand-slug="esmeralda" id="root"></div><script src="/bundle.js"></script></body></html>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
for(const width of [390,1280])test(`quantity, product-specific price/default, removal and limits (${width}px)`,async t=>{
 const context=await browser.newContext({viewport:{width,height:1000}});t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(7000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 await page.getByRole('heading',{name:'Testpizza',exact:true}).waitFor();
 assert.deepEqual(await page.getByRole('heading',{level:3}).allTextContents(),['Drikkevare','Ekstra tilbehør','Fjern ingredienser']);
 assert.equal(await page.getByRole('button',{name:'Ekstra tilbehør',exact:true}).getAttribute('aria-expanded'),'true');
 await page.getByRole('button',{name:'Fjern ingredienser',exact:true}).click();
 assert.equal(await page.getByLabel('Valgt antal Ost',{exact:true}).innerText(),'2');
 assert.equal(await page.getByRole('checkbox',{name:'Uden løg',exact:true}).isChecked(),false);
 // Required drink prevents submission, and quantity limits affect actual controls.
 await page.getByRole('button',{name:/Vælg de påkrævede tilvalg/}).click();assert.equal(await page.evaluate(()=>window.saved),undefined);
 await page.getByRole('button',{name:'Flere Ost',exact:true}).click();assert.equal(await page.getByLabel('Valgt antal Ost',{exact:true}).innerText(),'3');
 assert.equal(await page.getByRole('button',{name:'Flere Ost',exact:true}).isEnabled(),false);
 assert.equal(await page.getByText('Du har valgt 3 af 3. Fjern et valg for at vælge noget andet.',{exact:true}).isVisible(),true);
 await page.getByRole('checkbox',{name:'Uden løg',exact:true}).check();
 await page.locator('[data-option-row]').filter({has:page.getByRole('radio',{name:'Cola',exact:true})}).locator('[data-option-price]').click();
 assert.equal(await page.getByRole('radio',{name:'Cola',exact:true}).isChecked(),true);
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
 const panel=page.getByRole('dialog');await panel.waitFor();await page.evaluate(()=>document.fonts.ready);
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
 assert.equal(await page.getByText('1 resultat',{exact:true}).isVisible(),true);
 await page.getByRole('textbox',{name:'Søg i Saucer',exact:true}).fill('ingen træffere');
 assert.equal(await page.getByText('0 resultater',{exact:true}).isVisible(),true);
 assert.equal(await sauces.getByRole('radio',{name:'Sauce 12',exact:true}).isChecked(),true);
 assert.equal(await sauces.getByRole('radio').count(),2,'Ingen plus preserved selected choice');
 await page.getByRole('button',{name:'Ryd søgning',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'Søg i Saucer',exact:true}).inputValue(),'');
 assert.equal(await sauces.getByRole('radio',{name:'Sauce 12',exact:true}).isChecked(),true);
 await page.getByRole('button',{name:'Saucer',exact:true}).click();
 const section=page.getByRole('region',{name:'Saucer',exact:true});assert.match(await section.innerText(),/Sauce 12/);
 await page.getByRole('button',{name:'Saucer',exact:true}).click();await sauces.getByRole('radio',{name:'Ingen',exact:true}).check();
 await page.getByRole('button',{name:'Saucer',exact:true}).click();
 assert.doesNotMatch(await section.innerText(),/Sauce 12/);
 assert.equal(await page.getByRole('heading',{name:'Tilbehør til sauce',exact:true}).count(),0);
 const stepper=await page.getByRole('button',{name:'Flere Ost',exact:true}).boundingBox();assert.ok(stepper.width>=44&&stepper.height>=44);
 assert.equal(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 const submit=page.getByRole('button',{name:/Tilføj til kurv/});const box=await submit.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=850);
 if(process.env.TILVALG_SCREENSHOT_DIR){fs.mkdirSync(process.env.TILVALG_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.TILVALG_SCREENSHOT_DIR,`storefront-options-${width}.png`),fullPage:true});}
 await submit.click();const saved=await page.evaluate(()=>window.saved);assert.equal(saved.toppings.some(option=>option.id.startsWith('sauce')||option.id==='side1'),false);
});

for(const [width,height] of [[320,568],[390,480],[390,850],[1280,850]])test(`compact content and reachable scrolling/footer (${width}x${height})`,async t=>{
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});t.after(()=>context.close());
 const page=await context.newPage();await page.goto(origin+'/?compact');const panel=page.getByRole('dialog');await panel.waitFor();await page.evaluate(()=>document.fonts.ready);
 const extras=page.getByRole('button',{name:'Ekstra tilbehør',exact:true});assert.equal(await extras.getAttribute('aria-expanded'),'true');
 const row=page.locator('[data-option-row]').first();let rowBox=await row.boundingBox();assert.ok(rowBox.height>=44&&rowBox.height<=48,`row height ${rowBox.height}`);
 await row.locator('[data-option-price]').click();
 assert.equal(await page.getByRole('checkbox',{name:'Ost',exact:true}).isChecked(),true);
 const close=page.getByRole('button',{name:'Luk',exact:true});const closeBox=await close.boundingBox();assert.ok(closeBox.width>=44&&closeBox.height>=44);
 assert.equal(await row.evaluate(el=>getComputedStyle(el).boxShadow),'none');
 await page.getByRole('button',{name:'Færre Ost',exact:true}).focus();await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Flere Ost');
 assert.equal(await page.getByRole('button',{name:'Flere Ost',exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
 assert.equal(await row.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
 await extras.click();
 const collapsed=await panel.boundingBox();assert.ok(collapsed.height<430,`collapsed modal height ${collapsed.height}`);
 assert.ok(collapsed.y>=0&&collapsed.y+collapsed.height<=height+1);
 const footer=page.locator('.commerce-product-footer');const footerBox=await footer.boundingBox();assert.ok(footerBox.height<100,`footer height ${footerBox.height}`);
 assert.equal(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 if(process.env.TILVALG_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.TILVALG_SCREENSHOT_DIR,`storefront-collapsed-${width}x${height}.png`),fullPage:true});
 await page.goto(origin+'/?long');await panel.waitFor();await page.evaluate(()=>document.fonts.ready);
 await page.getByRole('button',{name:'Saucer',exact:true}).click();await page.getByRole('button',{name:'Vis alle (12)',exact:true}).click();
 const scroller=page.locator('[data-product-options-scroll]');
 assert.equal(await scroller.evaluate(el=>el.scrollHeight>el.clientHeight),true);
 await page.getByRole('radio',{name:'Sauce 12',exact:true}).check();
 assert.ok(await scroller.evaluate(el=>el.scrollTop)>0);
 const overlap=await page.evaluate(()=>{
   const close=document.querySelector('[data-product-options] > button:last-child').getBoundingClientRect();
   const clip=document.querySelector('[data-product-options-scroll]').getBoundingClientRect();
   return [...document.querySelectorAll('[data-option-price]')].some(el=>{
     const r=el.getBoundingClientRect(),top=Math.max(r.top,clip.top),bottom=Math.min(r.bottom,clip.bottom);
     return bottom>top&&Math.min(r.right,close.right)>Math.max(r.left,close.left)&&Math.min(bottom,close.bottom)>Math.max(top,close.top);
   });
 });assert.equal(overlap,false,'visible option price must not intersect the close target');
 const scrollerBox=await scroller.boundingBox(),fixedCloseBox=await page.getByRole('button',{name:'Luk',exact:true}).boundingBox();assert.ok(scrollerBox.y>=fixedCloseBox.y+fixedCloseBox.height);
 const submit=page.getByRole('button',{name:/Vælg de påkrævede tilvalg/});const submitBox=await submit.boundingBox();
 assert.ok(submitBox.y>=0&&submitBox.y+submitBox.height<=height+1,`submit bounds ${JSON.stringify(submitBox)}`);
 assert.equal(await page.getByRole('textbox',{name:'Søg i Saucer',exact:true}).evaluate(el=>getComputedStyle(el).fontSize),'16px');
 assert.equal(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 if(process.env.TILVALG_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.TILVALG_SCREENSHOT_DIR,`storefront-scrolled-${width}x${height}.png`),fullPage:true});
 await page.getByRole('button',{name:'Luk',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.getByRole('dialog').count(),0);
});

test('long names, quantity100 and high total remain readable at320px',async t=>{
 const context=await browser.newContext({viewport:{width:320,height:568},reducedMotion:'reduce'});t.after(()=>context.close());const page=await context.newPage();await page.goto(origin+'/?compact&wide');
 await page.getByRole('dialog').waitFor();await page.evaluate(()=>document.fonts.ready);
 const header=page.getByRole('region',{name:'Produktinformation',exact:true});await header.focus();await header.press('End');
 await page.waitForFunction(()=>document.querySelector('.commerce-option-header').scrollTop>0);
 await header.press('Home');
 await page.getByRole('checkbox',{name:'Ekstra frisk mozzarella og grillede grøntsager',exact:true}).check();
 await page.getByRole('button',{name:'Øg antal',exact:true}).evaluate(button=>{for(let n=1;n<100;n++)button.click();});
 assert.equal(await page.getByRole('button',{name:'Øg antal',exact:true}).isDisabled(),true);
 const panel=page.getByRole('dialog');assert.equal(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 const submit=page.getByRole('button',{name:/Tilføj til kurv/});assert.match(await submit.innerText(),/1.235.550,00/);
 assert.equal(await submit.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 const optionRow=page.locator('[data-option-row]').first();
 const rectangles=await optionRow.evaluate(el=>['.commerce-option-label','[data-option-price]','[data-option-stepper]'].map(selector=>{const r=el.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
 for(let a=0;a<rectangles.length;a++)for(let b=a+1;b<rectangles.length;b++){const x=rectangles[a],y=rectangles[b];assert.ok(Math.min(x.right,y.right)-Math.max(x.left,y.left)<=1||Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)<=1,`option controls overlap: ${JSON.stringify(rectangles)}`);}
 const textFits=await optionRow.locator('.commerce-option-label > span').evaluate(el=>el.scrollWidth<=el.clientWidth+1);assert.equal(textFits,true);
 const box=await submit.boundingBox();assert.ok(box.y+box.height<=568);
 if(process.env.TILVALG_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.TILVALG_SCREENSHOT_DIR,'storefront-long-name-320.png'),fullPage:true});
});
