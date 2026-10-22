import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { headers } from 'next/headers';
import { normalizeEmail } from '@/lib/integrations/esmeralda-customer-contract';
import { signup, signupSchema, resolveBrand, programForPortal } from './membership';
import { COLLECTIONS, memberIdentityKey, type MemberDoc } from './model';
import { LoyaltyError } from './counter';
import { loadCampaign } from './campaigns';
import { deliverLoyaltyMail } from './mail';
import { getClubSignupDiscountEligibility } from './club-discount';
export { getClubSignupDiscountEligibility } from './club-discount';

type CheckoutSignup = {db:Firestore;brandId:string;brandSlug:string;name:string;email:string;newsletterConsent:boolean;
  termsAccepted:boolean;consentVersion:string;termsVersion:string;campaignVersion?:string;discountId?:string;now?:number};

// Quotes validate the actual Club text versions without creating a member or sending mail.
export async function validateClubCheckoutSignup(input:CheckoutSignup):Promise<{eligible:boolean;customerId?:string}> {
  const parsed=signupSchema.safeParse({name:input.name,email:input.email,newsletterConsent:input.newsletterConsent,termsAccepted:input.termsAccepted,
    consentVersion:input.consentVersion,termsVersion:input.termsVersion,campaignVersion:input.campaignVersion});
  if(!parsed.success) throw new LoyaltyError('invalid_request',400);
  const brand=await resolveBrand(input.db,input.brandSlug);
  if(brand.brandId!==input.brandId) throw new LoyaltyError('forbidden',403);
  const campaign=await loadCampaign(input.db,brand.brandId);
  if(campaign.version===0 || campaign.settings.checkoutMode!=='club') throw new LoyaltyError('campaign_changed',409);
  const program=await programForPortal(input.db,brand,input.now??Date.now());
  if(!program.active) throw new LoyaltyError('program_inactive',409);
  if(program.consentVersion!==input.consentVersion || program.termsVersion!==input.termsVersion) throw new LoyaltyError('program_changed',409);
  if(input.campaignVersion && input.campaignVersion!==program.campaigns.version) throw new LoyaltyError('program_changed',409);
  const eligible=!input.discountId || await getClubSignupDiscountEligibility({...input,discountId:input.discountId,now:input.now??Date.now()});
  return {eligible};
}

// Called only after server prices/stale quote validation, before the existing discount reservation.
export async function prepareClubCheckoutSignup(input:CheckoutSignup):Promise<{customerId:string}> {
  const check=await validateClubCheckoutSignup(input);
  if(!check.eligible) throw new LoyaltyError('discount_unavailable',409);
  const brand=await resolveBrand(input.db,input.brandSlug),now=input.now??Date.now();
  const requestHeaders=await headers();
  const ip=(requestHeaders.get('x-forwarded-for')||'').split(',')[0].trim().slice(0,64)||'unknown';
  const {mailJob}=await signup(input.db,brand,{name:input.name,email:input.email,newsletterConsent:true,termsAccepted:true,
    consentVersion:input.consentVersion,termsVersion:input.termsVersion,campaignVersion:input.campaignVersion},{ip,now},{clubDiscountId:input.discountId,source:'checkout'});
  const identity=(await input.db.collection(COLLECTIONS.identities).doc(memberIdentityKey(input.brandId,normalizeEmail(input.email))).get()).data();
  const member=identity ? (await input.db.collection(COLLECTIONS.members).doc(String(identity.memberId)).get()).data() as MemberDoc|undefined : undefined;
  if(!member || member.brandId!==input.brandId || member.status!=='active') throw new LoyaltyError('customer_conflict',409);
  if(input.discountId && !await getClubSignupDiscountEligibility({...input,discountId:input.discountId,now})) throw new LoyaltyError('discount_unavailable',409);
  if(mailJob) await deliverLoyaltyMail(input.db,mailJob,now).catch(()=>null);
  return {customerId:member.customerId};
}
