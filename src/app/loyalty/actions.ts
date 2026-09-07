'use server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifiedCustomer,requireLoyaltyAdmin } from '@/lib/loyalty/identity';
import { getProgram,walletView } from '@/lib/loyalty/rewards';
import { programSchema } from '@/lib/loyalty/model';
import { z } from 'zod';
import { getLoyaltySettings } from '@/app/superadmin/loyalty/actions';
import { customerMetrics } from '@/lib/loyalty/model';

const brandSchema=z.string().min(1).max(150).refine(s=>!s.includes('/'));
export async function getLoyaltyAccount(brandId:string,token:string) {
  brandSchema.parse(brandId);const who=await verifiedCustomer(token);
  const [program,wallet]=await Promise.all([getProgram(brandId),walletView(brandId,who.uid)]);
  return {email:who.email,...wallet,program};
}
export async function getPublicLoyaltyProgram(brandId:string){return getProgram(brandSchema.parse(brandId));}
export async function saveLoyaltyProgram(brandId:string,raw:unknown,token:string) {
  brandSchema.parse(brandId);const who=await requireLoyaltyAdmin(token),program=programSchema.parse(raw);
  if(program.enabled && process.env.LOYALTY_FINANCIAL_RULES_READY!=='true')throw new Error('Loyalty activation requires verified server-only Firestore rules.');
  await getProgram(brandId);
  const db=getAdminDb();const batch=db.batch(),at=new Date().toISOString();
  batch.set(db.collection('loyalty_programs').doc(brandId),{program,updatedBy:who.uid,at});
  batch.set(db.collection('loyalty_audit').doc(),{brandId,actor:who.uid,program,at});await batch.commit();
  return {success:true};
}

// Explicit, audited repair for legacy aggregates. Never grants historical rewards.
export async function reconcileLoyaltyCustomer(brandId:string,customerId:string,token:string) {
  brandSchema.parse(brandId);brandSchema.parse(customerId);
  const actor=await requireLoyaltyAdmin(token),settings=await getLoyaltySettings(),db=getAdminDb();
  return db.runTransaction(async tx=>{
    const ref=db.collection('customers').doc(customerId),customer=await tx.get(ref);
    if(!customer.exists||customer.data()?.brandId!==brandId)throw new Error('Kunden tilhører ikke det valgte brand.');
    const orders=await tx.get(db.collection('orders').where('brandId','==',brandId).where('customerDetails.id','==',customerId));
    const metrics=customerMetrics(orders.docs.map(d=>d.data()),settings);
    tx.update(ref,{...metrics,lastOrderDate:metrics.lastOrderDate||null});
    tx.create(db.collection('loyalty_audit').doc(),{actor:actor.uid,brandId,customerId,kind:'reconcile_customer',at:new Date().toISOString(),totalOrders:metrics.totalOrders,totalSpend:metrics.totalSpend});
    return {totalOrders:metrics.totalOrders,totalSpend:metrics.totalSpend,score:metrics.loyaltyScore};
  });
}
