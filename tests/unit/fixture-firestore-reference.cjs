const {test}=require('node:test');
const assert=require('node:assert/strict');
const {memoryDb}=require('../helpers/marketing-db.cjs');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');

test('Admin path references and collection references share one stored document',async()=>{
 const rows=new Map([['orders/fixture',{amount:104}]]),db=memoryDb(rows);
 assert.deepEqual((await db.doc('orders/fixture').get()).data(),{amount:104});
 assert.equal(db.doc('orders/fixture').path,db.collection('orders').doc('fixture').path);
 await db.doc('orders/fixture').collection('adjustments').doc('credit').set({amount:-10});
 assert.deepEqual((await db.collection('orders/fixture/adjustments').doc('credit').get()).data(),{amount:-10});
 await db.runTransaction(async tx=>{
  const order=await tx.get(db.doc('orders/fixture'));
  assert.equal(order.data().amount,104);
  tx.update(db.collection('orders').doc('fixture'),{amount:94});
 });
 assert.equal((await db.doc('orders/fixture').get()).data().amount,94);
});

test('production modular Firestore bridge can read and transact against the Admin fixture contract',async()=>{
 const db=memoryDb(new Map([['orders/fixture',{paymentStatus:'Pending'}]]));
 const compat=moduleGraph({'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'firebase-admin/firestore':{Timestamp:{},FieldValue:{}}})('src/lib/server/firestore-compat.ts');
 const ref=compat.doc(compat.db,'orders','fixture');
 const before=await compat.getDoc(ref);
 assert.equal(before.exists(),true);assert.equal(before.data().paymentStatus,'Pending');
 await compat.runTransaction(compat.db,async tx=>{
  assert.equal((await tx.get(ref)).data().paymentStatus,'Pending');
  tx.update(ref,{paymentStatus:'Paid'});
 });
 assert.equal((await compat.getDoc(ref)).data().paymentStatus,'Paid');
});
