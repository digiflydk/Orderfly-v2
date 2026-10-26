'use strict';
const assert=require('node:assert/strict'),{randomBytes,createHash}=require('node:crypto');
const {Firestore}=require('@google-cloud/firestore');
const {PROJECT}=require('../../scripts/local-qa/environment.cjs');
const BASE='http://127.0.0.1:3100',AUTH='http://127.0.0.1:9099';
function boundary(){if(process.env.ORDERFLY_LOCAL_QA!=='true'||process.env.GCLOUD_PROJECT!==PROJECT||process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||Reflect.get(globalThis,Symbol.for('orderfly.qa0.loopback-guard'))!==true)throw Error('DELIVERY_QA0_BOUNDARY_REQUIRED');}
const actor=uid=>createHash('sha256').update(JSON.stringify(['firebase',uid])).digest('hex');
const ids=Object.freeze({brand:'qa0-delivery-brand',foreignBrand:'qa0-delivery-foreign-brand',location:'qa0-delivery-location',foreignLocation:'qa0-delivery-foreign-location'});
const merchantId=createHash('sha256').update(JSON.stringify([ids.brand,ids.location,'sandbox'])).digest('hex');
async function withDeliveryFixture(run){
 boundary();const db=new Firestore({projectId:PROJECT,host:'127.0.0.1:8088',ssl:false,credentials:{client_email:'qa0@demo-orderfly-qa0.invalid',private_key:'LOCAL_EMULATOR_ONLY_NOT_A_PRIVATE_KEY'}});
 const paths=['platformAdminControl/access-v1',`brands/${ids.brand}`,`brands/${ids.foreignBrand}`,`locations/${ids.location}`,`locations/${ids.foreignLocation}`,`deliverySettings/${ids.brand}`,`deliverySettings/${ids.foreignBrand}`,`deliveryMerchantEnrollments/${merchantId}`],accounts=[];let seeded=false;
 async function account(label){const email=`delivery-${label}@qa0.example.invalid`,password=randomBytes(24).toString('base64url');const r=await fetch(AUTH+'/identitytoolkit.googleapis.com/v1/accounts:signUp?key=qa0-public-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});assert.equal(r.status,200);const value=await r.json();accounts.push(value.localId);return {uid:value.localId,idToken:value.idToken,email,password};}
 async function session(user){const r=await fetch(BASE+'/api/admin/session',{method:'POST',headers:{origin:BASE,'content-type':'application/json'},body:JSON.stringify({idToken:user.idToken})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie?.startsWith('__session='));return cookie;}
 try{
  for(const p of paths){assert.equal((await db.doc(p).get()).exists,false,'DELIVERY_QA0_REFUSES_EXISTING_SEED');assert.equal((await db.doc(p).listCollections()).length,0,'DELIVERY_QA0_REFUSES_EXISTING_CHILDREN');}
  const manager=await account('manager'),viewer=await account('viewer'),superuser=await account('superuser');
  const permissions=['orderfly.catalog:view','orderfly.catalog:edit','orderfly.orders:view'];
  const policy={principals:[{id:actor(manager.uid),active:true,name:'QA0 DELIVERY manager'},{id:actor(viewer.uid),active:true,name:'QA0 DELIVERY viewer'}],
   companies:[{id:'qa0-delivery-company',active:true,locationIds:[ids.location],orderflyBrandIds:[ids.brand]},{id:'qa0-delivery-foreign-company',active:true,locationIds:[ids.foreignLocation],orderflyBrandIds:[ids.foreignBrand]}],
   roles:[{id:'qa0-delivery-manager-role',name:'DELIVERY manager',companyId:'qa0-delivery-company',kind:'company_user',permissions,active:true},{id:'qa0-delivery-viewer-role',name:'DELIVERY viewer',companyId:'qa0-delivery-company',kind:'company_user',permissions:['orderfly.catalog:view','orderfly.orders:view'],active:true}],
   memberships:[{id:'qa0-delivery-manager-member',principalId:actor(manager.uid),companyId:'qa0-delivery-company',locationIds:null,roleIds:['qa0-delivery-manager-role'],active:true},{id:'qa0-delivery-viewer-member',principalId:actor(viewer.uid),companyId:'qa0-delivery-company',locationIds:null,roleIds:['qa0-delivery-viewer-role'],active:true}]};
  policy.principals.push({id:actor(superuser.uid),active:true,name:'QA0 DELIVERY superuser'});
  policy.roles.push({id:'qa0-delivery-superuser-role',name:'DELIVERY superuser',companyId:null,kind:'superuser',permissions:[],active:true});
  policy.memberships.push({id:'qa0-delivery-superuser-member',principalId:actor(superuser.uid),companyId:null,locationIds:null,roleIds:['qa0-delivery-superuser-role'],active:true});
  const batch=db.batch();batch.create(db.doc(paths[0]),policy);
  for(const [id,name]of[[ids.brand,'QA0 DELIVERY Own'],[ids.foreignBrand,'QA0 DELIVERY Foreign']])batch.create(db.doc(`brands/${id}`),{id,name,status:'active',isActive:true});
  for(const [id,brandId]of[[ids.location,ids.brand],[ids.foreignLocation,ids.foreignBrand]])batch.create(db.doc(`locations/${id}`),{id,brandId,name:id,isActive:true});
  await batch.commit();seeded=true;
  const result=await run({db,ids,merchantId,manager,viewer,superuser,session,BASE,AUTH});
  return {...result,cleanupVerified:true};
 }finally{
  try{
   if(seeded){
    for(const owned of paths) await db.recursiveDelete(db.doc(owned));
    for(const owned of paths) assert.equal((await db.doc(owned).get()).exists,false,'DELIVERY_QA0_CLEANUP_DOCUMENT');
    for(const owned of paths) assert.equal((await db.doc(owned).listCollections()).length,0,'DELIVERY_QA0_CLEANUP_SUBCOLLECTIONS');
   }
  }finally{try{
   for(const uid of accounts){const r=await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`,{method:'POST',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({localId:uid})});assert.equal(r.status,200,'DELIVERY_QA0_CLEANUP_AUTH');}
   if(accounts.length){const lookup=await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,{method:'POST',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({localId:accounts})});assert.equal(lookup.status,200);assert.equal(((await lookup.json()).users??[]).length,0,'DELIVERY_QA0_VERIFY_AUTH_ABSENT');}
  }finally{await db.terminate();}}
 }
}
module.exports={withDeliveryFixture,boundary,ids,BASE};
