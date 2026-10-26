'use strict';
const assert=require('node:assert/strict');
const {Firestore}=require('@google-cloud/firestore');
const {withDeliveryFixture,boundary,ids}=require('./delivery-fixture.cjs');
module.exports=async function fixtureSafety(){
  boundary();
  const db=new Firestore({projectId:'demo-orderfly-qa0',host:'127.0.0.1:8088',ssl:false,credentials:{client_email:'qa0@demo-orderfly-qa0.invalid',private_key:'LOCAL_EMULATOR_ONLY_NOT_A_PRIVATE_KEY'}});
  try{
    for(const [path,message] of [['platformAdminControl/access-v1','DELIVERY_QA0_REFUSES_EXISTING_SEED'],['deliverySettings/'+ids.brand+'/audit/collision','DELIVERY_QA0_REFUSES_EXISTING_CHILDREN']]){
      const ref=db.doc(path);let owned=false;
      try{
        await ref.create({sentinel:'delivery-fixture-safety'});owned=true;
        await assert.rejects(()=>withDeliveryFixture(()=>{throw Error('fixture must not execute');}),error=>error.message.includes(message));
        assert.deepEqual((await ref.get()).data(),{sentinel:'delivery-fixture-safety'});
      }finally{if(owned){await ref.delete();assert.equal((await ref.get()).exists,false);}}
    }
  }finally{await db.terminate();}
};
