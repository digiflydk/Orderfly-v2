const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {loadTs}=require('../helpers/load-ts.cjs');
const {paymentMethodLabel}=loadTs('src/lib/merchant-payment-methods.ts');
for(const method of ['cash','card']) test(`actual sales page retains ${method} without exposing collection employee`,async()=>{
 const order={id:'QA',totalAmount:24,createdAt:new Date(),status:'Received',paymentStatus:'Paid',paymentMethod:'PayAtPickup',paymentCollection:{method,employeeId:'private',employeeName:'Private',receivedAt:'2026-09-30'}};
 const code=ts.transpileModule(fs.readFileSync('src/app/superadmin/sales/orders/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};
 const mocks={
  '@/lib/superadmin/getOrders':{getOrders:async()=>[order]},
  '@/components/superadmin/sales/orders-client-page':{OrdersClientPage:'OrdersClientPage'},
  '@/lib/next/resolve-props':{resolveSearchParams:async value=>await value},
  '@/lib/paid-order':loadTs('src/lib/paid-order.ts'),
 };
 new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);
 const result=await mod.exports.default({searchParams:Promise.resolve({})});
 const summary=result.props.data[0];
 assert.deepEqual(summary.paymentCollection,{method});
 assert.equal(summary.paidSale,true);
 assert.equal(paymentMethodLabel(summary),method==='cash'?'Betalt kontant i restaurant':'Betalt med kort i restaurant');
});
