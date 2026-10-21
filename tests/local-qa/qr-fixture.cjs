'use strict';
const assert=require('node:assert/strict'),{randomBytes,createHash}=require('node:crypto');
const {Firestore}=require('@google-cloud/firestore');
const {PROJECT}=require('../../scripts/local-qa/environment.cjs');
const BASE='http://127.0.0.1:3100',AUTH='http://127.0.0.1:9099';
function boundary(){if(process.env.ORDERFLY_LOCAL_QA!=='true'||process.env.GCLOUD_PROJECT!==PROJECT||process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||Reflect.get(globalThis,Symbol.for('orderfly.qa0.loopback-guard'))!==true)throw Error('QR_QA0_BOUNDARY_REQUIRED');}
const actor=uid=>createHash('sha256').update(JSON.stringify(['firebase',uid])).digest('hex');
const ids=Object.freeze({brand:'qa0-qr-brand',foreignBrand:'qa0-qr-foreign-brand',location:'qa0-qr-location',foreignLocation:'qa0-qr-foreign-location'});
async function withQrFixture(run){
 boundary();const db=new Firestore({projectId:PROJECT,host:'127.0.0.1:8088',ssl:false,credentials:{client_email:'qa0@demo-orderfly-qa0.invalid',private_key:'LOCAL_EMULATOR_ONLY_NOT_A_PRIVATE_KEY'}});
 const paths=['platformAdminControl/access-v1',`brands/${ids.brand}`,`brands/${ids.foreignBrand}`,`locations/${ids.location}`,`locations/${ids.foreignLocation}`],accounts=[];let seeded=false;
 async function account(label){const email=`qr-${label}@qa0.example.invalid`,password=randomBytes(24).toString('base64url');const r=await fetch(AUTH+'/identitytoolkit.googleapis.com/v1/accounts:signUp?key=qa0-public-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});assert.equal(r.status,200);const value=await r.json();accounts.push(value.localId);return {uid:value.localId,idToken:value.idToken,email,password};}
 async function session(user){const r=await fetch(BASE+'/api/admin/session',{method:'POST',headers:{origin:BASE,'content-type':'application/json'},body:JSON.stringify({idToken:user.idToken})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie?.startsWith('__session='));return cookie;}
 try{
  for(const p of paths)assert.equal((await db.doc(p).get()).exists,false,'QR_QA0_REFUSES_EXISTING_SEED');
  const manager=await account('manager'),viewer=await account('viewer');
  const permissions=['view','create','edit','archive','export','analytics'].map(a=>'orderfly.qr_codes:'+a);
  const policy={principals:[{id:actor(manager.uid),active:true,name:'QA0 QR manager'},{id:actor(viewer.uid),active:true,name:'QA0 QR viewer'}],
   companies:[{id:'qa0-qr-company',active:true,locationIds:[ids.location],orderflyBrandIds:[ids.brand]},{id:'qa0-qr-foreign-company',active:true,locationIds:[ids.foreignLocation],orderflyBrandIds:[ids.foreignBrand]}],
   roles:[{id:'qa0-qr-manager-role',name:'QR manager',companyId:'qa0-qr-company',kind:'company_user',permissions,active:true},{id:'qa0-qr-viewer-role',name:'QR viewer',companyId:'qa0-qr-company',kind:'company_user',permissions:['orderfly.qr_codes:view','orderfly.qr_codes:analytics'],active:true}],
   memberships:[{id:'qa0-qr-manager-member',principalId:actor(manager.uid),companyId:'qa0-qr-company',locationIds:[ids.location],roleIds:['qa0-qr-manager-role'],active:true},{id:'qa0-qr-viewer-member',principalId:actor(viewer.uid),companyId:'qa0-qr-company',locationIds:[ids.location],roleIds:['qa0-qr-viewer-role'],active:true}]};
  const batch=db.batch();batch.create(db.doc(paths[0]),policy);
  for(const [id,name]of[[ids.brand,'QA0 QR Own'],[ids.foreignBrand,'QA0 QR Foreign']])batch.create(db.doc(`brands/${id}`),{id,name,status:'active',isActive:true});
  for(const [id,brandId]of[[ids.location,ids.brand],[ids.foreignLocation,ids.foreignBrand]])batch.create(db.doc(`locations/${id}`),{id,brandId,name:id,isActive:true});
  await batch.commit();seeded=true;
  const result=await run({db,ids,manager,viewer,session,BASE,AUTH});
  return {...result,cleanupVerified:true};
 }finally{
  try{
   if(seeded){
    const published=await db.collection('qrPublicCodes').where('brandId','in',[ids.brand,ids.foreignBrand]).get();for(const p of published.docs)await p.ref.delete();
    for(const p of paths.filter(p=>p.startsWith('brands/')))await db.recursiveDelete(db.doc(p));
    for(const p of paths.filter(p=>!p.startsWith('brands/')))await db.doc(p).delete();
    for(const p of paths)assert.equal((await db.doc(p).get()).exists,false,'QR_QA0_CLEANUP_DOCUMENT');
    assert.equal((await db.collection('qrPublicCodes').where('brandId','in',[ids.brand,ids.foreignBrand]).get()).size,0,'QR_QA0_CLEANUP_PUBLIC_INDEX');
   }
   for(const uid of accounts){const r=await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`,{method:'POST',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({localId:uid})});assert.equal(r.status,200,'QR_QA0_CLEANUP_AUTH');}
   const lookup=await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,{method:'POST',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({localId:accounts})});assert.equal(lookup.status,200);assert.equal(((await lookup.json()).users??[]).length,0,'QR_QA0_VERIFY_AUTH_ABSENT');
  }finally{await db.terminate();}
 }
}
module.exports={withQrFixture,boundary,ids,BASE};
