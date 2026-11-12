import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import ts from 'typescript';

// Execute the production settings component with intercepted server actions and inert UI primitives.
// This suite never starts Firebase, Secret Manager, Stripe or Worldline.
async function mount(page:any, options:{location?:boolean;denied?:boolean;missingMd5?:boolean;storageFailure?:boolean;transportFailure?:boolean}={}){
  await page.route('https://payments.test/**',(route:any)=>route.fulfill({contentType:'text/html',body:'<html><body><main id="root"></main></body></html>'}));
  await page.goto('https://payments.test/');
  await page.addScriptTag({content:fs.readFileSync('node_modules/react/umd/react.development.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js','utf8')});
  const code=ts.transpileModule(fs.readFileSync('src/components/superadmin/worldline-settings.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
  await page.evaluate(({code,options}:any)=>{
    const w=window as any,R=w.React;w.saves=[];
    const settings={source:options.location?'brand':'own',provider:'stripe',mode:'disabled',brandProvider:'worldline',brandMode:'test',revision:0,testSet:false,liveSet:false,stripeTestSet:false,stripeLiveSet:false};
    const actions={loadWorldlineSettings:async()=>{if(options.denied)throw Error('denied');return settings;},saveWorldlineSettings:async(scope:any,input:any)=>{w.saves.push({scope,input});if(options.transportFailure)throw Error('An error occurred in the Server Components render. private-digest');if(options.missingMd5&&!input.test.md5Key)return {ok:false,code:'WORLDLINE_MD5_REQUIRED',message:'MD5-nøglen mangler. Den er separat fra API-nøglen og findes under Settings → Merchant numbers → Edit → MD5 key.',field:'test.md5Key'};if(options.storageFailure)return {ok:false,code:'KEY_STORAGE_PERMISSION_DENIED',message:'Adgang til nøglelagringen mangler. Betalingsopsætningen er ikke gemt.'};return {ok:true,settings:{...settings,...input,revision:input.revision+1}};}};
    const exports:any={};new Function('require','exports','React',code)((name:string)=>name==='react'?R:name.includes('worldline-actions')?actions:name.includes('/button')?{Button:(props:any)=>R.createElement('button',props)}:{Input:(props:any)=>R.createElement('input',props)},exports,R);
    w.ReactDOM.createRoot(document.getElementById('root')).render(R.createElement(exports.WorldlineSettings,{brandId:'b',...(options.location?{locationId:'l'}:{})}));
  },{code,options});
}
test('inherited location shows brand environment and requires own agreement before editing keys',async({page})=>{
 await mount(page,{location:true});await expect(page.getByText(/Arver brandets aftale/)).toContainText('Worldline');await expect(page.getByLabel('Test Access Token')).toHaveCount(0);
 await page.getByRole('combobox',{name:/^Betalingsaftale/}).selectOption('own');await page.getByLabel('Betalingsudbyder').selectOption('worldline');await expect(page.getByLabel('Test API-nøgle')).toBeVisible();await page.getByLabel('Worldline adgangsformat').selectOption('separate');await expect(page.getByLabel('Test Access Token')).toBeVisible();
});
test('Stripe-only entry sends separate keys and clears sensitive fields after save',async({page})=>{
 await mount(page);await page.getByLabel('Miljø for aftalen').selectOption('test');await page.getByLabel('Test Stripe secretKey').fill('sk_test_synthetic');await page.getByLabel('Test Stripe publishableKey').fill('pk_test_synthetic');await page.getByLabel('Test Stripe webhookSecret').fill('whsec_synthetic');
 await page.getByRole('button',{name:'Gem betalingsopsætning',exact:true}).click();await expect(page.getByLabel('Test Stripe secretKey')).toHaveValue('');
 const saves=await page.evaluate(()=>(window as any).saves);expect(saves).toHaveLength(1);expect(saves[0].input.provider).toBe('stripe');expect(saves[0].input.stripeTest.secretKey).toBe('sk_test_synthetic');expect(saves[0].input.test.accessToken).toBe('');
});
test('denied configuration never displays editable credential fields',async({page})=>{
 await mount(page,{denied:true});await expect(page.getByRole('status')).toContainText('platformadministratoradgang');await expect(page.getByRole('button')).toHaveCount(0);
});

test('combined API key keeps MD5 separate and returns a readable field error without losing the input',async({page})=>{
 await mount(page,{missingMd5:true});await page.getByLabel('Betalingsudbyder').selectOption('worldline');await page.getByLabel('Miljø for aftalen').selectOption('test');
 const apiKey=Buffer.from('synthetic-access@T123:synthetic-secret').toString('base64');await page.getByLabel('Test API-nøgle').fill(apiKey);await page.getByRole('button',{name:'Gem betalingsopsætning',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('MD5-nøglen mangler');await expect(page.getByLabel('Test MD5-nøgle')).toHaveAttribute('aria-invalid','true');await expect(page.getByLabel('Test API-nøgle')).toHaveValue(apiKey);
 await page.getByLabel('Test MD5-nøgle').fill('synthetic-md5');await page.getByRole('button',{name:'Gem betalingsopsætning',exact:true}).click();await expect(page.getByLabel('Test API-nøgle')).toHaveValue('');await expect(page.getByLabel('Test MD5-nøgle')).toHaveValue('');
 const saves=await page.evaluate(()=>(window as any).saves);expect(saves[1].input.testApiKey).toBe(apiKey);expect(saves[1].input.test.accessToken).toBe('');expect(saves[1].input.test.secretToken).toBe('');
});
test('key storage permission failure is visible as a safe returned message',async({page})=>{
 await mount(page,{storageFailure:true});await page.getByRole('button',{name:'Gem betalingsopsætning',exact:true}).click();await expect(page.getByRole('status')).toContainText('Adgang til nøglelagringen mangler');await expect(page.getByText(/Server Components render/)).toHaveCount(0);
});
test('unexpected Next transport errors never render the masked framework error',async({page})=>{
 await mount(page,{transportFailure:true});await page.getByRole('button',{name:'Gem betalingsopsætning',exact:true}).click();await expect(page.getByRole('status')).toContainText('Gemningen kunne ikke bekræftes');await expect(page.getByText(/Server Components render|private-digest/)).toHaveCount(0);
});
