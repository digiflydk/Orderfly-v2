import 'server-only';
import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { defaultProgram, programSchema, rewardQuote, refundTargets, type LoyaltyProgram } from './model';

const key=(brand:string,uid:string)=>createHash('sha256').update(JSON.stringify([brand,uid])).digest('hex');
export async function getProgram(brandId:string):Promise<LoyaltyProgram> {
  const db=getAdminDb();
  if(!(await db.collection('brands').doc(brandId).get()).exists)throw new Error('Brand not found');
  const snap=await db.collection('loyalty_programs').doc(brandId).get();
  return snap.exists?programSchema.parse(snap.data()?.program):defaultProgram;
}
export async function walletView(brandId:string,uid:string) {
  const db=getAdminDb(),ref=db.collection('loyalty_wallets').doc(key(brandId,uid));
  const [w,events]=await Promise.all([ref.get(),ref.collection('entries').orderBy('at','desc').limit(30).get()]);
  const data=w.data()||{};
  return {balanceOre:data.balanceOre||0,heldOre:data.heldOre||0,availableOre:Math.max(0,(data.balanceOre||0)-(data.heldOre||0)),history:events.docs.map(d=>({id:d.id,...d.data()}))};
}
// Program snapshot and amount are fixed before issuing the payable Stripe session.
export async function reserveRewards(orderId:string,brandId:string,uid:string,requested:number,goodsOre:number,totalBeforeRewardOre:number,program:LoyaltyProgram) {
  const db=getAdminDb(),r=db.collection('loyalty_orders').doc(orderId),w=db.collection('loyalty_wallets').doc(key(brandId,uid));
  return db.runTransaction(async tx=>{
    const [old,wallet,config]=await Promise.all([tx.get(r),tx.get(w),tx.get(db.collection('loyalty_programs').doc(brandId))]);
    if(old.exists)throw new Error('Reward reservation exists');
    const current=config.exists?programSchema.parse(config.data()?.program):defaultProgram;
    if(JSON.stringify(current)!==JSON.stringify(program))throw new Error('Loyaltyindstillinger er ændret. Prøv igen.');
    const data=wallet.data()||{},balance=data.balanceOre||0,held=data.heldOre||0;
    const quote=rewardQuote(program,balance-held,goodsOre,requested);
    const at=new Date().toISOString();
    tx.set(w,{brandId,uid,balanceOre:balance,heldOre:held+quote.redeemOre});
    tx.create(r,{brandId,uid,walletId:w.id,...quote,status:'held',refundedOre:0,totalOre:totalBeforeRewardOre-quote.redeemOre,at});
    if(quote.redeemOre)tx.set(w.collection('entries').doc(orderId+'-hold'),{orderId,kind:'reserved',amountOre:quote.redeemOre,at});
    return quote;
  });
}
// A timeout never releases a potentially payable session. Only caller-proven
// pre-request failure or Stripe expiration may release a hold.
export async function settleRewards(orderId:string,brandId:string,paid:boolean,totalOre?:number) {
  const db=getAdminDb(),r=db.collection('loyalty_orders').doc(orderId);
  await db.runTransaction(async tx=>{
    const snap=await tx.get(r);if(!snap.exists)return;
    const d=snap.data()!;if(d.brandId!==brandId)throw new Error('Reward scope mismatch');
    if(paid && d.totalOre!==totalOre)throw new Error('Reward payment amount mismatch');
    if(d.status==='paid'||d.status==='released') {
      if(paid && d.status==='released')throw new Error('Payment for released reward reservation');
      return;
    }
    const w=db.collection('loyalty_wallets').doc(d.walletId),s=await tx.get(w),v=s.data()||{};
    const targets=refundTargets(d.earnOre,d.redeemOre,d.refundedOre,d.totalOre);
    const delta=paid?d.earnOre-d.redeemOre-targets.reversed+targets.restored:0;
    tx.set(w,{brandId:d.brandId,uid:d.uid,balanceOre:(v.balanceOre||0)+delta,heldOre:Math.max(0,(v.heldOre||0)-d.redeemOre)});
    tx.update(r,{status:paid?'paid':'released',...targets});
    tx.set(w.collection('entries').doc(orderId+'-settled'),{orderId,kind:paid?'paid':'released',amountOre:delta,earnedOre:paid?d.earnOre:0,redeemedOre:paid?d.redeemOre:0,at:new Date().toISOString()});
  });
}
export async function refundRewards(orderId:string,brandId:string,cumulativeOre:number) {
  const db=getAdminDb(),r=db.collection('loyalty_orders').doc(orderId);
  await db.runTransaction(async tx=>{
    const snap=await tx.get(r);if(!snap.exists)return;
    const d=snap.data()!;if(d.brandId!==brandId)throw new Error('Refund reward scope mismatch');
    const refund=Math.min(d.totalOre,Math.max(d.refundedOre||0,cumulativeOre));
    if(refund===(d.refundedOre||0))return;
    if(d.status!=='paid'){tx.update(r,{refundedOre:refund});return;}
    const w=db.collection('loyalty_wallets').doc(d.walletId),wallet=await tx.get(w),v=wallet.data()||{};
    const targets=refundTargets(d.earnOre,d.redeemOre,refund,d.totalOre);
    const delta=-(targets.reversed-(d.reversed||0))+(targets.restored-(d.restored||0));
    // Keep debt after a refund, rather than silently minting credit already spent.
    tx.update(w,{balanceOre:(v.balanceOre||0)+delta});
    tx.update(r,{refundedOre:refund,...targets});
    tx.set(w.collection('entries').doc(orderId+'-refund-'+refund),{orderId,kind:'refund',amountOre:delta,at:new Date().toISOString()});
  });
}
