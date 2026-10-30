const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const sessionId='cs_test_receipt_fixture';
const tracking={orderId:'order-a',bookingState:'pending',deliveryStatus:null,paymentStatus:'paid',deliveryInterval:null};
function fixture(extra={}){
 const order={id:'order-a',brandId:'brand-a',locationId:'location-a',customerName:'Test',customerContact:'test@example.test',customerDetails:{id:'customer-a',address:'Testvej 1'},createdAt:'2026-10-30T10:00:00Z',deliveryType:'Delivery',deliveryTime:'fre. 30. okt. 11:30',fulfillmentAt:'2026-10-30T10:30:00.000Z',expectedDeliveryAt:'2026-10-30T11:00:00.000Z',managedDelivery:{version:1},status:'Received',paymentStatus:'Paid',paymentMethod:'Stripe',totalAmount:135,productItems:[],paymentDetails:{subtotal:100,deliveryFee:35,paymentRefId:'private'},psp:{checkoutSessionId:sessionId},...extra};
 const {readGuestReceipt}=loadTs('src/lib/server/guest-receipt.ts',{'server-only':{},'@/lib/delivery/tracking-server':{readReceiptDeliveryTracking:async()=>order.managedDelivery?tracking:null},'@/app/checkout/order-actions':{getOrderById:async()=>order,getOrderByCheckoutSessionId:async()=>order},'@/lib/server/payment-settings':{},'./settle-checkout':{}});
 return proof=>readGuestReceipt({sessionId,orderId:'order-a',brandId:'brand-a',locationId:'location-a',...proof},{reconcilePayment:false});
}
test('scoped guest receipt exposes distinct arrival estimate, never kitchen fulfillment or private fields',async()=>{
 const read=fixture(),receipt=await read();assert.equal(receipt.expectedDeliveryAt,'2026-10-30T11:00:00.000Z');assert.equal(receipt.deliveryTime,'fre. 30. okt. 11:30');assert.equal(receipt.fulfillmentAt,undefined);assert.equal(receipt.psp,undefined);assert.equal(receipt.paymentDetails.paymentRefId,undefined);assert.equal(await read({brandId:'foreign'}),null);assert.equal(await read({sessionId:'cs_test_wrong_session'}),null);
});
test('arrival projection normalizes native values and omits absent invalid or legacy estimates',async()=>{
 for(const value of [new Date('2026-10-30T11:00:00Z'),{toDate:()=>new Date('2026-10-30T11:00:00Z')}])assert.equal((await fixture({expectedDeliveryAt:value})()).expectedDeliveryAt,'2026-10-30T11:00:00.000Z');
 for(const value of [undefined,null,'asap','fre. 30. okt. 12:00','2026-02-30T11:00:00Z',new Date('invalid'),{toDate:()=>{throw Error('bad timestamp');}}])assert.equal((await fixture({expectedDeliveryAt:value})()).expectedDeliveryAt,undefined);
 assert.equal((await fixture({managedDelivery:undefined})()).expectedDeliveryAt,undefined);
});
