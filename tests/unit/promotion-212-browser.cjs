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
 const actions=file('actions',`export async function getDiscountCustomers(){return [{id:'customer',name:'QA customer',email:'okh@digifly.dk'}];}export async function getNewsletterSetup(){return null;}export async function createOrUpdateDiscount(_,form){return (await fetch('/save',{method:'POST',body:form})).json();}export const createOrUpdateStandardDiscount=createOrUpdateDiscount;export const createOrUpdateUpsell=createOrUpdateDiscount;export async function getProductsForBrand(){return [{id:'p',brandId:'b',productName:'Pepsi',categoryId:'c',price:20}];}export async function getCategoriesForBrand(){return [];}`);
 const loader=file('loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const alias={'@/app/superadmin/discounts/actions':actions,'@/app/superadmin/upsells/actions':actions,'@/app/superadmin/standard-discounts/actions':actions,'@/components/superadmin/admin-link':file('link',"import React from 'react';export default React.forwardRef((props,ref)=><a {...props} ref={ref}/>);"),'@/hooks/use-toast':file('toast','export const useToast=()=>({toast:()=>{}});'),'@':path.join(root,'src')};
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
