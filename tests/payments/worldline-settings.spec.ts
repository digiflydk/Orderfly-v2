import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import ts from 'typescript';

// Execute the production settings component with intercepted server actions and inert UI primitives.
// This suite never starts Firebase, Secret Manager, Stripe or Worldline.
async function mount(page:any, options:{location?:boolean;denied?:boolean}={}){
  await page.route('https://payments.test/**',(route:any)=>route.fulfill({contentType:'text/html',body:'<html><body><main id="root"></main></body></html>'}));
  await page.goto('https://payments.test/');
  await page.addScriptTag({content:fs.readFileSync('node_modules/react/umd/react.development.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js','utf8')});
  const code=ts.transpileModule(fs.readFileSync('src/components/superadmin/worldline-settings.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
  await page.evaluate(({code,options}:any)=>{
    const w=window as any,R=w.React;w.saves=[];
    const settings={source:options.location?'brand':'own',provider:'stripe',mode:'disabled',brandProvider:'worldline',brandMode:'test',revision:0,testSet:false,liveSet:false,stripeTestSet:false,stripeLiveSet:false};
    const actions={loadWorldlineSettings:async()=>{if(options.denied)throw Error('denied');return settings;},saveWorldlineSettings:async(scope:any,input:any)=>{w.saves.push({scope,input});return {...settings,...input,revision:input.revision+1};}};
    const exports:any={};new Function('require','exports','React',code)((name:string)=>name==='react'?R:name.includes('worldline-actions')?actions:name.includes('/button')?{Button:(props:any)=>R.createElement('button',props)}:{Input:(props:any)=>R.createElement('input',props)},exports,R);
    w.ReactDOM.createRoot(document.getElementById('root')).render(R.createElement(exports.WorldlineSettings,{brandId:'b',...(options.location?{locationId:'l'}:{})}));
  },{code,options});
}
test('inherited location shows brand environment and requires own agreement before editing keys',async({page})=>{
 await mount(page,{location:true});await expect(page.getByText(/Arver brandets aftale/)).toContainText('Worldline');await expect(page.getByLabel('Test Access Token')).toHaveCount(0);
 await page.getByLabel('Betalingsaftale',{exact:true}).selectOption('own');await page.getByLabel('Betalingsudbyder').selectOption('worldline');await expect(page.getByLabel('Test Access Token')).toBeVisible();
});
test('Stripe-only entry sends separate keys and clears sensitive fields after save',async({page})=>{
 await mount(page);await page.getByLabel('Miljø for aftalen').selectOption('test');await page.getByLabel('Test Stripe secretKey').fill('sk_test_synthetic');await page.getByLabel('Test Stripe publishableKey').fill('pk_test_synthetic');await page.getByLabel('Test Stripe webhookSecret').fill('whsec_synthetic');
 await page.getByRole('button',{name:'Gem Worldline-opsætning',exact:true}).click();await expect(page.getByLabel('Test Stripe secretKey')).toHaveValue('');
 const saves=await page.evaluate(()=>(window as any).saves);expect(saves).toHaveLength(1);expect(saves[0].input.provider).toBe('stripe');expect(saves[0].input.stripeTest.secretKey).toBe('sk_test_synthetic');expect(saves[0].input.test.accessToken).toBe('');
});
test('denied configuration never displays editable credential fields',async({page})=>{
 await mount(page,{denied:true});await expect(page.getByRole('status')).toContainText('platformadministratoradgang');await expect(page.getByRole('button')).toHaveCount(0);
});
