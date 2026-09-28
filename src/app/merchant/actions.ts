'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getAdminDb, admin } from '@/lib/firebase-admin';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { principalKey } from '@/lib/access/authority';

const id=/^[A-Za-z0-9_-]{1,128}$/;
const amountPattern=/^(?:0|[1-9]\d{0,5})(?:[.,]\d{1,2})?$/;
const hash=(parts:string[])=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');

export async function redeemMerchantGameCode(form:FormData):Promise<{ok:boolean;message:string}>{
  const brandId=String(form.get('brandId')||''),locationId=String(form.get('locationId')||''),voucherId=String(form.get('voucherId')||'');
  const amountInput=String(form.get('amount')||'').trim();
  if(!id.test(brandId)||!id.test(locationId)||!/^[a-f0-9]{64}$/.test(voucherId)||!amountPattern.test(amountInput))return {ok:false,message:'Kontrollér kode, restaurant og købsbeløb.'};
  const amount=Number(amountInput.replace(',','.'));
  if(!Number.isFinite(amount)||amount<0||amount>999999.99)return {ok:false,message:'Ugyldigt købsbeløb.'};
  try{
    const identity=await verifiedOrderflyIdentity(),db=getAdminDb();
    const ref=db.collection('gameVouchers').doc(voucherId),conversionRef=db.collection('gameConversions').doc(hash(['restaurant',brandId,voucherId]));
    await db.runTransaction(async tx=>{
      const [voucher,conversion]=await Promise.all([tx.get(ref),tx.get(conversionRef)]);
      await authorizeTransaction(tx,identity,{brandId,locationIds:[locationId]},'orderfly.games:redeem','locations');
      const data=voucher.data();
      if(!data||data.brandId!==brandId||data.mode!=='live'||data.state!=='issued'||data.codeMode==='shared'||
        !(Array.isArray(data.redemptionChannels)?data.redemptionChannels.includes('restaurant'):data.redemption!=='website'))throw new Error('not_redeemable');
      if(conversion.exists)throw new Error('already_redeemed');
      const play=await tx.get(db.collection('gamePlays').doc(String(data.playId||'')));
      if(!play.exists||play.data()?.brandId!==brandId||play.data()?.mode!=='live')throw new Error('play_scope');
      if(data.discountId){
        const discountRef=db.collection('discounts').doc(data.discountId),capacityRef=db.collection('checkout_discount_capacity').doc(hash([brandId,data.discountId]));
        const [discount,capacity]=await Promise.all([tx.get(discountRef),tx.get(capacityRef)]);
        if(discount.data()?.brandId!==brandId||discount.data()?.code!==data.code||!discount.data()?.isActive||
          Number(discount.data()?.usedCount||0)>0||Number(capacity.data()?.held||0)>0||Number(capacity.data()?.paid||0)>0)throw new Error('online_claim');
        tx.update(discountRef,{isActive:false,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
      }
      const now=admin.firestore.FieldValue.serverTimestamp(),actorId=principalKey(identity);
      tx.update(ref,{state:'redeemed',redeemedAt:now,redeemedBy:actorId,redeemedLocationId:locationId,redeemedChannel:'restaurant'});
      tx.create(conversionRef,{brandId,campaignId:data.campaignId||brandId,channel:'restaurant',locationId,playId:data.playId,
        prizeName:data.prizeName,codeMode:data.codeMode,amount,currency:'DKK',status:amount>0?'paid':'redeemed',createdAt:now});
      tx.create(db.collection('auditLogs').doc(),{module:'games',entity:'voucher',entityId:voucherId,action:'restaurant-redeem',brandId,locationId,actorId,amount,timestamp:now});
    });
    revalidatePath('/merchant/redeem');revalidatePath('/superadmin/games');
    return {ok:true,message:'Koden er indløst. Den kan ikke bruges igen online eller i restauranten.'};
  }catch{return {ok:false,message:'Koden er allerede brugt, reserveret online eller kan ikke indløses i denne restaurant. Opdater listen.'};}
}
