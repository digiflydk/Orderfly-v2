import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb, admin } from '@/lib/firebase-admin';
import { scratchCardDraftSchema, prizeChannels } from '@/lib/games/scratch-card';

export const runtime='nodejs';
const payload=z.object({brandId:z.string().regex(/^[\w-]{1,128}$/),orderId:z.string().min(1).max(120),code:z.string().regex(/^[A-Za-z0-9_-]{5,40}$/),amount:z.number().finite().min(0).max(1000000),currency:z.literal('DKK'),status:z.enum(['paid','refunded'])}).strict();
function secretFor(brandId:string){
  try{const mapping=JSON.parse(process.env.ORDERFLY_GAMES_PARTNER_SECRETS||'{}');const secret=mapping[brandId];return typeof secret==='string'&&secret.length>=32?secret:null;}catch{return null;}
}
export async function POST(request:Request){
  const raw=await request.text();
  if(raw.length>4096)return Response.json({error:'Payload too large'},{status:413});
  const parsed=payload.safeParse((()=>{try{return JSON.parse(raw)}catch{return null}})());
  if(!parsed.success)return Response.json({error:'Invalid payload'},{status:400});
  const {brandId,orderId,code,status,amount,currency}=parsed.data,secret=secretFor(brandId);
  const timestamp=request.headers.get('x-game-timestamp')||'',signature=request.headers.get('x-game-signature')||'';
  const time=Number(timestamp);
  if(!secret||!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-time)>300000||!/^sha256=[a-f0-9]{64}$/.test(signature))return Response.json({error:'Unauthorized'},{status:401});
  const expected=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');
  if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature.slice(7),'hex')))return Response.json({error:'Unauthorized'},{status:401});
  try{
    const db=getAdminDb(),campaign=await db.collection('gameScratchDrafts').doc(brandId).get(),game=scratchCardDraftSchema.safeParse(campaign.data());
    if(!game.success)return Response.json({error:'Campaign not found'},{status:404});
    const vouchers=await db.collection('gameVouchers').where('brandId','==',brandId).where('code','==',code.toUpperCase()).limit(2).get();
    const match=vouchers.docs.filter(doc=>doc.data().mode==='live'&&(Array.isArray(doc.data().redemptionChannels)?doc.data().redemptionChannels.includes('external'):['website','both'].includes(doc.data().redemption)));
    const shared=game.data.prizes.find(p=>p.codeMode==='shared'&&p.sharedCode?.toUpperCase()===code.toUpperCase()&&prizeChannels(p).includes('external'));
    if(!match.length&&!shared)return Response.json({error:'Code not issued'},{status:404});
    const unique=match.length===1&&match[0].data().codeMode!=='shared'?match[0]:null;
    const ref=db.collection('gameConversions').doc(createHash('sha256').update(JSON.stringify(['external',brandId,orderId])).digest('hex'));
    await db.runTransaction(async tx=>{
      const existing=await tx.get(ref),previous=existing.data();
      if(existing.exists){
        if(previous?.brandId!==brandId||previous?.orderId!==orderId||previous?.code!==code.toUpperCase())throw new Error('Order conflict');
        if(previous.status===status)return;
        if(previous.status!=='paid'||status!=='refunded')throw new Error('Invalid transition');
        tx.update(ref,{status:'refunded',refundedAt:admin.firestore.FieldValue.serverTimestamp()});return;
      }
      if(status!=='paid')throw new Error('Unknown order');
      if(unique){
        const fresh=await tx.get(unique.ref);
        if(fresh.data()?.brandId!==brandId||fresh.data()?.state!=='issued')throw new Error('Code already used');
        if(fresh.data()?.discountId){
          const discountRef=db.collection('discounts').doc(fresh.data()!.discountId);
          const capacityRef=db.collection('checkout_discount_capacity').doc(createHash('sha256').update(JSON.stringify([brandId,discountRef.id])).digest('hex'));
          const [discount,capacity]=await Promise.all([tx.get(discountRef),tx.get(capacityRef)]);
          if(discount.data()?.brandId!==brandId||!discount.data()?.isActive||Number(discount.data()?.usedCount||0)>0||Number(capacity.data()?.held||0)>0||Number(capacity.data()?.paid||0)>0)throw new Error('Code held or redeemed internally');
          tx.update(discountRef,{isActive:false,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
        }
        tx.update(unique.ref,{state:'redeemed',redeemedOrderId:orderId,redeemedAt:admin.firestore.FieldValue.serverTimestamp()});
      }
      tx.create(ref,{brandId,channel:'external',orderId,code:code.toUpperCase(),playId:unique?.data().playId||null,prizeName:unique?.data().prizeName||shared?.name||null,codeMode:unique?.data().codeMode||'shared',amount,currency,status:'paid',createdAt:admin.firestore.FieldValue.serverTimestamp()});
    });
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Conversion not accepted'},{status:409});}
}
