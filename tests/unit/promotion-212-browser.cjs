const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium,expect}=require('@playwright/test');
const compiler=require('next/dist/compiled/webpack/webpack');compiler.init();
const root=process.cwd();let dir,server,browser,origin;
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'promotion-212-browser-'));
 const file=(name,source)=>{const target=path.join(dir,name+'.js');fs.writeFileSync(target,source);return target;};
 const entry=file('entry',`import React from 'react';import {createRoot} from 'react-dom/client';import {UpsellFormPage} from ${JSON.stringify(path.join(root,'src/components/superadmin/upsell-form-page.tsx'))};import {DiscountFormPage} from ${JSON.stringify(path.join(root,'src/components/superadmin/discount-form-page.tsx'))};import {StandardDiscountFormPage} from ${JSON.stringify(path.join(root,'src/components/superadmin/standard-discount-form-page.tsx'))};
 const common={id:'qa',brandId:'b',locationIds:['l'],isActive:false,orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],minOrderValue:0,usageLimit:0,perCustomerLimit:0};
 const props={brands:[{id:'b',name:'QA brand'}],locations:[{id:'l',brandId:'b',name:'QA location'}],products:[{id:'p',brandId:'b',productName:'Pepsi',categoryId:'c'}],categories:[]};
 const code={...common,applicationType:'code',code:'QA212',discountType:'percentage',discountValue:10,assignedToCustomerId:'customer'};
 const standard={...common,discountName:'QA tiers',discountType:'product',referenceIds:['p'],discountMethod:'quantity_tiers',timeSlotValidationType:'orderTime',quantityTiers:[{minQuantity:2,method:'percentage',value:10}]};
 const upsell={...common,upsellName:'QA upsell',offerType:'product',offerProductIds:['p'],discountType:'percentage',discountValue:10,triggerConditions:[{id:'t',type:'cart_value_over',referenceId:'100'}]};createRoot(document.getElementById('root')).render(location.pathname==='/upsell'?<UpsellFormPage {...props} upsell={upsell}/>:location.pathname==='/tiers'?<StandardDiscountFormPage {...props} discount={standard}/>:<DiscountFormPage {...props} discount={code}/>);`);
 const actions=file('actions',`export const getUpsells=async()=>[{id:'first',brandId:'b',upsellName:'Sodavand først'},{id:'nested',brandId:'b',afterUpsellId:'first',upsellName:'Allerede trin 2'},{id:'foreign',brandId:'other',upsellName:'Andet brand'}];export async function getDiscountCustomers(){return [{id:'customer',name:'QA customer',email:'okh@digifly.dk'}];}export async function getNewsletterSetup(){return null;}export async function createOrUpdateDiscount(_,form){return (await fetch('/save',{method:'POST',body:form})).json();}export const createOrUpdateStandardDiscount=createOrUpdateDiscount;export const createOrUpdateUpsell=createOrUpdateDiscount;export async function getProductsForBrand(){return [{id:'p',brandId:'b',productName:'Pepsi',categoryId:'c',price:20}];}export async function getCategoriesForBrand(){return [{id:'c',categoryName:'Drikkevarer'}];}export async function getCombosForUpsellBrand(){return [{id:'menu',comboName:'Pizzamenu'}];}`);
 const loader=file('loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const alias={'@/app/superadmin/discounts/actions':actions,'@/app/superadmin/upsells/actions':actions,'@/app/superadmin/standard-discounts/actions':actions,'@/components/superadmin/admin-link':file('link',"import React from 'react';export default React.forwardRef((props,ref)=><a {...props} ref={ref}/>);"),'@/hooks/use-toast':file('toast','const toast=()=>{};export const useToast=()=>({toast});'),'@':path.join(root,'src')};
 for(const name of ['react','react/jsx-runtime','react-dom','react-dom/client'])alias[name+'$']=require.resolve('next/dist/compiled/'+name);
 await new Promise((resolve,reject)=>compiler.webpack({mode:'development',devtool:false,entry,plugins:[new compiler.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],output:{path:dir,filename:'bundle.js'},resolve:{alias,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/promotion-212-browser-.*\.js$/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 server=http.createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript; charset=utf-8');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(req.url==='/brands'){res.setHeader('content-type','application/json');return res.end(JSON.stringify([{id:'allowed',name:'Allowed brand'}]));}
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});

test('actual discount form shows field errors for 101 and 0, sends no save, and offers clearing a customer',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();page.on("pageerror",error=>console.error(error.message));page.setDefaultTimeout(5000);let saves=[];
 await page.route('**/save',async route=>{const data=await new Request('http://fixture/save',{method:'POST',headers:{'content-type':route.request().headers()['content-type']},body:route.request().postDataBuffer()}).formData();saves.push(data);await route.fulfill({json:{error:false,message:'Saved'}});});
 await page.goto(origin);
 await expect(page.getByRole('combobox',{name:'Specific Customer (Optional)'})).toContainText('QA customer');
 await page.getByLabel('Discount Value',{exact:true}).fill('101');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page.locator('p').filter({hasText:/^Procentrabatten må højst være 100 %\.$/})).toBeVisible();assert.equal(saves.length,0);
 await page.getByLabel('Discount Value',{exact:true}).fill('0');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page.getByText('Rabatten skal være større end 0.',{exact:true})).toBeVisible();assert.equal(saves.length,0);
 await page.getByLabel('Discount Value',{exact:true}).fill('10');await page.getByRole('combobox',{name:'Specific Customer (Optional)'}).click();await page.getByRole('option',{name:'Alle kunder',exact:true}).click();await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await expect.poll(()=>saves.length).toBe(1);assert.equal(saves[0].get('assignedToCustomerId'),'');assert.equal(saves[0].get('discountValue'),'10');
});
test('actual tiers form exposes empty-array error at tiers, rejects duplicates, then accepts tier 2 / 10%',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();page.on("pageerror",error=>console.error(error.message));page.setDefaultTimeout(5000);let saves=0;
 await page.route('**/save',route=>{saves++;return route.fulfill({json:{error:false,message:'Saved'}});});await page.goto(origin+'/tiers');
 await page.getByRole('button',{name:'Remove tier',exact:true}).click();await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page.getByText('Tilføj mindst ét gyldigt rabattrin.',{exact:true})).toBeVisible();await expect(page.getByRole('alert')).toContainText('Rabatten blev ikke gemt');assert.equal(saves,0);
 await page.getByRole('button',{name:'Add tier',exact:true}).click();await page.getByRole('button',{name:'Add tier',exact:true}).click();await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page.getByText('Quantity thresholds must be unique.',{exact:true})).toBeVisible();assert.equal(saves,0);
 await page.getByRole('button',{name:'Remove tier',exact:true}).last().click();await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect.poll(()=>saves).toBe(1);
});

test('upsell form validates percentage before sending and preserves the editable draft',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();let saves=0;
 await page.route('**/save',route=>{saves++;return route.fulfill({json:{error:false,message:'Saved'}});});await page.goto(origin+'/upsell');
 await page.getByLabel('Discount Value',{exact:true}).fill('101');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page.locator('p').filter({hasText:/^Procentrabatten må højst være 100 %\.$/})).toBeVisible();assert.equal(saves,0);
 await page.getByLabel('Discount Value',{exact:true}).fill('10');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect.poll(()=>saves).toBe(1);
});

for(const width of [390,1280])test(`upsell exclusions can be saved and cleared (${width})`,async t=>{
 const context=await browser.newContext({viewport:{width,height:900}});t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(8000);let saves=[];
 await page.route('**/save',async route=>{saves.push(await new Request('http://fixture/save',{method:'POST',headers:{'content-type':route.request().headers()['content-type']},body:route.request().postDataBuffer()}).formData());await route.fulfill({json:{error:false,message:'Saved'}});});
 await page.goto(origin+'/upsell');
 const section=page.locator('div').filter({has:page.getByText('Vis ikke tilbuddet, hvis kurven indeholder …',{exact:true})}).filter({has:page.getByRole('checkbox',{name:'Pizzamenu',exact:true})}).last();
 for(const name of ['Pepsi','Drikkevarer','Pizzamenu'])await section.getByRole('checkbox',{name,exact:true}).check();
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect.poll(()=>saves.length).toBe(1);
 for(const [key,id] of [['excludeProductIds','p'],['excludeCategoryIds','c'],['excludeComboIds','menu']])assert.deepEqual(saves[0].getAll(key),[id]);
 for(const name of ['Pepsi','Drikkevarer','Pizzamenu'])await section.getByRole('checkbox',{name,exact:true}).uncheck();
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect.poll(()=>saves.length).toBe(2);
 for(const key of ['excludeProductIds','excludeCategoryIds','excludeComboIds'])assert.deepEqual(saves[1].getAll(key),[]);
});

test('quantity ranges and dynamic heading templates survive the actual form',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(8000);let saved;
 await page.route('**/save',async route=>{saved=await new Request('http://fixture/save',{method:'POST',headers:{'content-type':route.request().headers()['content-type']},body:route.request().postDataBuffer()}).formData();await route.fulfill({json:{error:false,message:'Saved'}});});
 await page.goto(origin+'/upsell');
 await page.getByLabel('Overskrift ved én matchende vare',{exact:true}).fill('Noget koldt til din pizza?');
 await page.getByLabel('Overskrift ved flere matchende varer',{exact:true}).fill('Noget koldt til dine {antal} pizzaer?');
 await page.getByRole('combobox',{name:'Trigger Type',exact:true}).click();await page.getByRole('option',{name:'Category in Cart',exact:true}).click();
 await page.getByRole('combobox',{name:'Trigger Category',exact:true}).click();await page.getByRole('option',{name:'Drikkevarer',exact:true}).click();
 await page.getByLabel('Mindst antal',{exact:true}).fill('3');await page.getByLabel('Højst antal',{exact:true}).fill('2');
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page.locator('p').filter({hasText:/^Maksimum skal være mindst minimum\.$/})).toBeVisible();assert.equal(saved,undefined);
 await page.getByLabel('Højst antal',{exact:true}).fill('5');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect.poll(()=>!!saved).toBe(true);
 assert.equal(saved.get('headingPlural'),'Noget koldt til dine {antal} pizzaer?');assert.equal(JSON.parse(saved.get('triggerConditions'))[0].minQuantity,3);
});

test('admin saves follow-up campaign, control group and manual badge overrides',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 let saved;
 await page.route('**/save',async route=>{
  const data=await new Request('http://fixture/save',{method:'POST',headers:{'content-type':route.request().headers()['content-type']},body:route.request().postDataBuffer()}).formData();
  saved=Object.fromEntries(data);await route.fulfill({json:{error:false,message:'Saved'}});
 });
 await page.goto(origin+'/upsell');
 const parent=page.getByLabel('Vis efter accepteret kampagne',{exact:true});
 await expect(parent.locator('option')).toHaveCount(2);await parent.selectOption('first');
 const badge=page.getByRole('combobox',{name:'Pepsi',exact:true});
 await expect(badge).toBeVisible();await badge.selectOption('recommended');
 await page.getByLabel('Kontrolgruppe (%)',{exact:true}).fill('15');
 await page.getByRole('switch',{name:'Automatiske badges',exact:true}).click();
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await expect.poll(()=>saved?.afterUpsellId).toBe('first');
 assert.equal(saved.discountValue,'10');assert.equal(saved.controlPercent,'15');assert.equal(saved.automaticBadges,'false');
 assert.deepEqual(JSON.parse(saved.badgeOverrides),{p:'recommended'});
 await badge.selectOption('none');await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await expect.poll(()=>JSON.parse(saved.badgeOverrides).p).toBe('none');
});
