import 'server-only';
import { hashKey } from './model';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { campaignInPeriod, readCampaign } from './campaign-rules';
import { loadCampaign } from './campaigns';
import { selectClubDiscount, listClubDiscountOffers } from './club-discount';

export async function publicCampaignBenefits(db:Firestore,brandId:string,programActive:boolean,now:number,tx?:Transaction) {
  if(!programActive) return {welcomeStamps:0,profile:null,discount:null,version:hashKey('inactive')};
  const [campaign,discounts]=await Promise.all([tx?tx.get(db.collection('loyaltyCampaigns').doc(brandId)).then(s=>readCampaign(brandId,s.data())):loadCampaign(db,brandId),listClubDiscountOffers(db,brandId,now,tx)]);
  const benefits = {welcomeStamps:campaignInPeriod(campaign.settings.welcome,now)?campaign.settings.welcome.stamps:0,
    profile:campaignInPeriod(campaign.settings.profile,now)?{stamps:campaign.settings.profile.stamps,requiredFields:campaign.settings.profile.requiredFields}:null,discount:discounts[0]??null};
  return {...benefits,version:hashKey(JSON.stringify({version:campaign.version,settings:campaign.settings,...benefits,discounts}))};
}

import type { MemberDoc } from './model';
import { customerHasEmail } from '@/lib/customer-identity';
import { bonusGrantId, bonusCustomerGrantId } from './bonus';
import { BONUS_GRANTS_COLLECTION } from './campaigns';

// Only the authenticated member's own pending entitlement is projected; no claim identifiers or contact fields leave this function.
export async function memberCampaignBenefits(db:Firestore,member:MemberDoc,customer:Record<string,unknown>|undefined,programActive:boolean,now:number) {
  if(!customer || customer.brandId!==member.brandId || !customerHasEmail(customer,member.normalizedEmail))
    return {profile:null,profileBonusGranted:false,discount:null};
  const [campaign,emailGrant,customerGrant]=await Promise.all([loadCampaign(db,member.brandId),
    db.collection(BONUS_GRANTS_COLLECTION).doc(bonusGrantId(member.brandId,member.normalizedEmail,'profile')).get(),
    db.collection(BONUS_GRANTS_COLLECTION).doc(bonusCustomerGrantId(member.brandId,member.customerId,'profile')).get()]);
  const pending=typeof customer.pendingClubDiscountId==='string'?customer.pendingClubDiscountId:null;
  const usage=customer.discountUsage as Record<string,number>|undefined;
  const discount=pending && !(Number(usage?.[pending]||0)>0) ? await selectClubDiscount(db,member.brandId,now,pending) : null;
  return {profile:programActive && campaignInPeriod(campaign.settings.profile,now)
      ? {stamps:campaign.settings.profile.stamps,requiredFields:campaign.settings.profile.requiredFields}:null,
    profileBonusGranted:emailGrant.exists||customerGrant.exists,discount};
}
