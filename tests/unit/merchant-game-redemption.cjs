const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const crypto=require('node:crypto');

const brandId='brand_a',locationId='location_a',voucherId='a'.repeat(64),playId='b'.repeat(64),code='OF-TEST12345';
const key=parts=>crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');

function setup({held=0,foreign=false,amount='125.50'}={}){
  const records=new Map();
  records.set(`gameVouchers/${voucherId}`,{brandId:foreign?'brand_b':brandId,mode:'live',state:'issued',codeMode:'generated',code,playId,prizeName:'Pizza',campaignId:'campaign_a',redemptionChannels:['restaurant','orderfly'],discountId:`game_${voucherId}`});
  records.set(`gamePlays/${playId}`,{brandId,mode:'live'});
  records.set(`discounts/game_${voucherId}`,{brandId,code,isActive:true,usedCount:0});
  records.set(`checkout_discount_capacity/${key([brandId,`game_${voucherId}`])}`,{held,paid:0});
  const ref=(path)=>({path});
  const db={collection(name){return {doc(id){return ref(`${name}/${id||crypto.randomUUID()}`)}}},async runTransaction(callback){
    const writes=[];
    const tx={async get(item){const value=records.get(item.path);return {exists:!!value,data:()=>value}},update(item,data){writes.push(()=>records.set(item.path,{...records.get(item.path),...data}))},create(item,data){if(records.has(item.path))throw Error('duplicate');writes.push(()=>records.set(item.path,data))}};
    const result=await callback(tx);for(const write of writes)write();return result;
  }};
  const source=fs.readFileSync('src/app/merchant/actions.ts','utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};
  const dependencies={
    'next/cache':{revalidatePath:()=>{}},
    '@/lib/firebase-admin':{getAdminDb:()=>db,admin:{firestore:{FieldValue:{serverTimestamp:()=>new Date()}}}},
    '@/lib/access/orderfly-session':{verifiedOrderflyIdentity:async()=>({provider:'firebase',subject:'staff'})},
    '@/lib/access/scoped-data':{authorizeTransaction:async(_tx,_identity,scope,permission)=>{assert.deepEqual(scope,{brandId,locationIds:[locationId]});assert.equal(permission,'orderfly.games:redeem');}},
    '@/lib/access/authority':{principalKey:()=> 'staff-id'},
  };
  new Function('require','module','exports',compiled)((name)=>dependencies[name]||require(name),{exports},exports);
  const form=new FormData();for(const [field,value] of Object.entries({brandId,locationId,voucherId,amount}))form.set(field,value);
  return {redeem:()=>exports.redeemMerchantGameCode(form),records};
}

test('a restaurant claim deactivates online discount and records one paid conversion',async()=>{
  const {redeem,records}=setup();
  assert.equal((await redeem()).ok,true);
  assert.equal(records.get(`gameVouchers/${voucherId}`).state,'redeemed');
  assert.equal(records.get(`discounts/game_${voucherId}`).isActive,false);
  assert.equal(records.get(`gameConversions/${key(['restaurant',brandId,voucherId])}`).amount,125.5);
  assert.equal((await redeem()).ok,false);
  assert.equal([...records.keys()].filter(row=>row.startsWith('gameConversions/')).length,1);
});

test('a free prize claim is recorded without inflating paid purchase metrics',async()=>{
  const {redeem,records}=setup({amount:'0'});
  assert.equal((await redeem()).ok,true);
  assert.equal(records.get(`gameConversions/${key(['restaurant',brandId,voucherId])}`).status,'redeemed');
});

test('an online checkout hold or foreign voucher blocks the restaurant claim without writes',async()=>{
  for(const options of [{held:1},{foreign:true}]){
    const {redeem,records}=setup(options);
    assert.equal((await redeem()).ok,false);
    assert.equal(records.get(`gameVouchers/${voucherId}`).state,'issued');
    assert.equal(records.get(`discounts/game_${voucherId}`).isActive,true);
    assert.equal([...records.keys()].filter(row=>row.startsWith('gameConversions/')).length,0);
  }
});
