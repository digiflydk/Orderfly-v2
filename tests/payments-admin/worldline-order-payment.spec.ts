import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import ts from 'typescript';
async function mount(page:any, options:{responses?:string[];locked?:boolean;canEdit?:boolean;canVoid?:boolean;pending?:any}={}){
  await page.route('https://payments-admin.test/**',(route:any)=>route.fulfill({contentType:'text/html',body:'<html><body><main id="root"></main></body></html>'}));
  await page.goto('https://payments-admin.test/');
  await page.addScriptTag({content:fs.readFileSync('node_modules/react/umd/react.development.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js','utf8')});
  const code=ts.transpileModule(fs.readFileSync('src/components/superadmin/worldline-order-payment.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
  await page.evaluate(({code,options}:any)=>{
    const w=window as any,R=w.React;w.requests=[];w.refreshed=0;
    let response=0;
    const snapshot={provider:'worldline',environment:'test',agreement:'brand',merchantNumber:'T123',paymentStatus:options.canVoid?'Pending':'Paid',amountMinor:12500,refundedMinor:0,remainingMinor:12500,locked:!!options.locked,managedDelivery:false,canVoid:!!options.canVoid,canRefund:!options.canVoid&&!options.locked,pending:options.pending||null,voided:false};
    const actions={loadWorldlineOrderPayment:async()=>snapshot,worldlineOrderOperation:async(input:any)=>{w.requests.push(input);const state=(options.responses||['confirmed'])[response++]||'confirmed';if(state==='throw')throw Error('transport lost');return {state};}};
    const box=(tag:string)=>(props:any)=>R.createElement(tag,props,props.children);
    const dialog={Dialog:({open,children}:any)=>open?R.createElement('div',{role:'dialog'},children):null,DialogContent:box('div'),DialogDescription:box('p'),DialogTitle:box('h2'),DialogFooter:box('div'),DialogHeader:box('div')};
    const exports:any={};new Function('require','exports','React',code)((name:string)=>name==='react'?R:name==='next/navigation'?{useRouter:()=>({refresh:()=>w.refreshed++})}:name.includes('worldline-operations-actions')?actions:name.includes('/button')?{Button:box('button')}:name.includes('/input')?{Input:box('input')}:dialog,exports,R);
    w.ReactDOM.createRoot(document.getElementById('root')).render(R.createElement(exports.WorldlineOrderPayment,{orderId:'o',canEdit:options.canEdit!==false}));
  },{code,options});
}
test('refund validates amount and requires explicit confirmation before the server action',async({page})=>{
 await mount(page);await page.getByLabel('Refunderingsbeløb i DKK').fill('125,01');await expect(page.getByRole('button',{name:'Refundér beløb',exact:true})).toBeDisabled();
 await page.getByLabel('Refunderingsbeløb i DKK').fill('12,34');await page.getByRole('button',{name:'Refundér beløb',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('12,34');expect(await page.evaluate(()=>(window as any).requests)).toHaveLength(0);
 await page.getByRole('button',{name:'Bekræft handling',exact:true}).click();await expect(page.getByText('Refunderingen er bekræftet.',{exact:true})).toBeVisible();
 const requests=await page.evaluate(()=>(window as any).requests);expect(requests).toHaveLength(1);expect(requests[0].amountMinor).toBe(1234);expect(requests[0].operation).toBe('credit');expect(requests[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
});
test('unknown refund retains identity and immutable amount on retry and refresh',async({page})=>{
 await mount(page,{responses:['unknown','throw','confirmed']});await page.getByLabel('Refunderingsbeløb i DKK').fill('50,00');await page.getByRole('button',{name:'Refundér beløb',exact:true}).click();await page.getByRole('button',{name:'Bekræft handling',exact:true}).click();
 await expect(page.getByRole('button',{name:'Kontrollér resultat',exact:true})).toBeVisible();await expect(page.getByLabel('Refunderingsbeløb i DKK')).toHaveCount(0);
 await page.getByRole('button',{name:'Kontrollér resultat',exact:true}).click();await expect(page.getByText(/Samme anmodning er bevaret/)).toBeVisible();
 await page.getByRole('button',{name:'Genindlæs betalingsstatus',exact:true}).click();await page.getByRole('button',{name:'Kontrollér resultat',exact:true}).click();await expect(page.getByText('Refunderingen er bekræftet.',{exact:true})).toBeVisible();
 const requests=await page.evaluate(()=>(window as any).requests);expect(requests).toHaveLength(3);expect(new Set(requests.map((r:any)=>r.requestId)).size).toBe(1);expect(requests.every((r:any)=>r.amountMinor===5000)).toBe(true);
});
test('void carries no amount and viewer/foreign lock never exposes money controls',async({page})=>{
 await mount(page,{canVoid:true});await page.getByRole('button',{name:'Annullér betalingsreservation',exact:true}).click();await page.getByRole('button',{name:'Bekræft handling',exact:true}).click();await expect(page.getByText('Reservationen er annulleret.',{exact:true})).toBeVisible();
 const requests=await page.evaluate(()=>(window as any).requests);expect(requests[0].operation).toBe('delete');expect(requests[0].amountMinor).toBeUndefined();
 await mount(page,{locked:true,canEdit:false});await expect(page.getByText(/Nye pengeoperationer er låst/)).toBeVisible();await expect(page.getByRole('button',{name:'Refundér beløb',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Kontrollér resultat',exact:true})).toHaveCount(0);
});
