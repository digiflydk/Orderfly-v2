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
