const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');

test('paid order invoice snapshots seller, lines, discounts, VAT and scheduled supply time',()=>{
 const {buildOrderInvoice,invoiceNumber}=loadTs('src/lib/order-invoice.ts');
 const order={id:'ORD-1',customerName:'Kunde',customerContact:'kunde@example.test',deliveryType:'Delivery',
  fulfillmentAt:{toDate:()=>new Date('2026-09-11T17:30:00.000Z')},customerDetails:{id:'c',address:'Kundevej 2, 2300 København S'},
  productItems:[{name:'Pizza',quantity:2,totalPrice:180,listTotalPrice:200}],totalAmount:194,
  paymentDetails:{subtotal:200,itemDiscountTotal:20,cartDiscountTotal:10,deliveryFee:20,bagFee:4,adminFee:0,vatAmount:38.8}};
 const invoice=buildOrderInvoice({order,brand:{id:'b',name:'Esmeralda Pizza',companyName:'Esmeralda Pizza ApS',companyRegNo:'12345678',street:'Sælgervej 1',zipCode:'2300',city:'København S',country:'DK',currency:'DKK',vatPercentage:25},location:{id:'l',brandId:'b',name:'Amager',address:'Sælgervej 1, 2300 København S'},sequence:7,issuedAt:'2026-09-11T12:00:00.000Z'});
 assert.equal(invoiceNumber(2026,7),'INV-2026-000007');
 assert.equal(invoice.supplyDate,'2026-09-11T17:30:00.000Z');
 assert.deepEqual(invoice.lines,[{description:'Pizza',quantity:2,unitAmount:100,totalAmount:200}]);
 assert.equal(invoice.seller.registrationNumber,'12345678');
 assert.deepEqual({subtotal:invoice.subtotal,itemDiscount:invoice.itemDiscount,orderDiscount:invoice.orderDiscount,deliveryFee:invoice.deliveryFee,bagFee:invoice.bagFee,vatAmount:invoice.vatAmount,total:invoice.totalAmount},{subtotal:200,itemDiscount:20,orderDiscount:10,deliveryFee:20,bagFee:4,vatAmount:38.8,total:194});
});

test('campaign attribution keeps bounded campaign fields but strips URLs and unsafe values',()=>{
 const {campaignAttribution,normalizeAttribution}=loadTs('src/lib/analytics-attribution.ts');
 const result=campaignAttribution(new URLSearchParams('utm_source=google&utm_medium=cpc&utm_campaign=Amager+Pizza&gclid=abc-123'),'\/esmeralda-pizza\/amager','https://www.google.com/search?q=pizza');
 assert.deepEqual(result,{source:'google',medium:'cpc',campaign:'Amager Pizza',gclid:'abc-123',landingPath:'/esmeralda-pizza/amager',referrerHost:'www.google.com'});
 assert.deepEqual(normalizeAttribution({source:'<script>',landingPath:'/menu?private=1',referrer:'https://example.test/private?q=secret'}),{referrerHost:'example.test'});
});

test('untagged navigation retains the campaign and a tagged arrival replaces it',()=>{
 const {campaignAttribution,resolveAttribution}=loadTs('src/lib/analytics-attribution.ts');
 const stored=campaignAttribution(new URLSearchParams('utm_source=google&utm_campaign=pizza'),'/esmeralda','https://google.com/');
 const next=campaignAttribution(new URLSearchParams(),'/esmeralda/menu','https://google.com/');
 assert.deepEqual(resolveAttribution(next,stored),stored);
 const changed=campaignAttribution(new URLSearchParams('utm_source=meta'),'/esmeralda/menu','');
 assert.equal(resolveAttribution(changed,stored).source,'meta');
});

test('legacy discounted lines and zero-rate snapshots reconcile without fabricating original prices',()=>{
 const {buildOrderInvoice}=loadTs('src/lib/order-invoice.ts');
 const invoice=buildOrderInvoice({order:{customerDetails:{},productItems:[{name:'Pizza',quantity:2,totalPrice:180}],totalAmount:194,paymentDetails:{subtotal:200,itemDiscountTotal:20,cartDiscountTotal:10,deliveryFee:20,bagFee:4,vatAmount:38.8}},brand:{name:'Test',vatPercentage:0},location:{name:'Test'},sequence:1,issuedAt:'2026-09-11T12:00:00Z'});
 assert.equal(invoice.subtotal,180);assert.equal(invoice.itemDiscount,0);assert.equal(invoice.vatAmount,0);assert.equal(invoice.taxableAmount,194);
 assert.equal(invoice.lines.reduce((sum,line)=>sum+line.totalAmount,0)-invoice.orderDiscount+invoice.deliveryFee+invoice.bagFee,invoice.totalAmount);
});

test('legacy pending confirmation still sends the legacy payload',async()=>{
 const {memoryDb}=require('../helpers/marketing-db.cjs');
 const db=memoryDb();
 db.rows.set('orders/o',{brandId:'b',locationId:'l',paymentStatus:'Paid',status:'Received',customerContact:'test@example.test',totalAmount:100});
 db.rows.set('orderNotificationJobs/j',{brandId:'b',locationId:'l',orderId:'o',eventId:'e',state:'pending',nextAttemptAt:1});
 const {runOrderNotificationWorker}=loadTs('src/lib/notifications/order-worker.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}});
 let sent;const result=await runOrderNotificationWorker(()=>({send:async payload=>{sent=payload}}),2);
 assert.equal(result.accepted,1);assert.equal(sent.variables.totalAmount,100);
 assert.equal('invoiceNumber' in sent.variables,false);assert.equal(db.rows.get('orderNotificationJobs/j').state,'accepted');
});
