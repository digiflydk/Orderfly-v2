import {deliveryPickupWindowAllows} from '../settings/schedule';
import 'server-only';
import {restaurantFingerprint} from './restaurant-snapshot';
import {invalidateQuoteRestaurant} from './restaurant-cache';
import type {Brand,Location} from '@/types';
import {createHash} from 'node:crypto';
import {getAdminDb} from '@/lib/firebase-admin';
import {loadDeliverySettingsInTransaction} from '../settings/server';
import {storedDeliveryQuoteSchema} from './schema';
import {verifyCustomerQuoteClaim,type AuthoritativeDraft,type CustomerQuoteClaim,type CustomerQuoteProof} from './customer-boundary';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const id=(v:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(v);
function draftRef(keyHash:string){if(!/^[a-f0-9]{64}$/.test(keyHash))throw Error('invalid_draft');return getAdminDb().collection('deliveryCheckoutDrafts').doc(keyHash);}
export async function saveAuthoritativeCustomerDraft(input:Omit<AuthoritativeDraft,'draftRevision'|'addressRevision'>):Promise<AuthoritativeDraft>{
 return getAdminDb().runTransaction(async tx=>{const ref=draftRef(input.checkoutKeyHash),previous=(await tx.get(ref)).data();
  const revision=previous?.draftRevision??0;if(!Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER)throw Error('invalid_draft');
  const draft={...input,draftRevision:revision+1,addressRevision:revision+1};
  tx.set(ref,{...draft,expiresAt:new Date(Date.now()+10*60000)});return draft;});
}
export async function loadCurrentCustomerDraft(keyHash:string):Promise<AuthoritativeDraft>{const snapshot=await draftRef(keyHash).get();if(!snapshot.exists)throw Error('draft_missing');return snapshot.data() as AuthoritativeDraft;}
async function assertDraftCurrent(tx:FirebaseFirestore.Transaction,claim:CustomerQuoteClaim){
 const current=(await tx.get(draftRef(claim.checkoutKeyHash))).data();
 if(!current||current.requestDigest!==claim.requestDigest||current.draftRevision!==claim.draftRevision||current.addressRevision!==claim.addressRevision
  ||current.binding?.brandId!==claim.quote.binding.brandId||current.binding?.locationId!==claim.quote.binding.locationId||Date.now()>=(current.expiresAtMs??current.expiresAt?.toMillis?.()??current.expiresAt?.getTime?.()??0))throw Error('quote_draft_changed');
 return current;
}
async function currentSettings(tx:FirebaseFirestore.Transaction,claim:CustomerQuoteClaim,draft:Promise<FirebaseFirestore.DocumentData>){
 const q=claim.quote,b=q.binding,db=getAdminDb();
 const locationRead=tx.get(db.collection('locations').doc(b.locationId));
 const [brand,location,current,loaded]=await Promise.all([tx.get(db.collection('brands').doc(b.brandId)),locationRead,draft,loadDeliverySettingsInTransaction(tx,b.brandId,b.locationId,locationRead)]);
 if(current.restaurantFingerprint&&restaurantFingerprint({...brand.data(),id:b.brandId} as Brand,{...location.data(),id:b.locationId} as Location)!==current.restaurantFingerprint){invalidateQuoteRestaurant();throw Error('quote_settings_changed');}
 if(!brand.exists||!location.exists||location.data()?.brandId!==b.brandId||location.data()?.isActive!==true)throw Error('quote_scope_changed');
 const {result}=loaded;
 if(!deliveryPickupWindowAllows(result.settings,q.fulfillment.readyAt,q.providerQuote.pickupInterval))throw Error('quote_settings_changed');
 if(!result.settings.enabled||result.settings.paused||result.brandRevision!==b.brandRevision||result.revision!==b.locationRevision||result.settings.providerId!==b.providerId)throw Error('quote_settings_changed');
}
/** Commit these counters in their own transaction before calling a provider; failures never refund the budget. */
export async function reserveCustomerQuoteRate(checkoutHash:string,networkHash:string,now=Date.now()):Promise<boolean>{
 if(!/^[a-f0-9]{64}$/.test(checkoutHash)||!/^[a-f0-9]{64}$/.test(networkHash)||!Number.isSafeInteger(now)||now<0)return false;
 const window=Math.floor(now/60000),db=getAdminDb();
 return db.runTransaction(async tx=>{
  const refs=[db.collection('deliveryQuoteRateLimits').doc(hash(`checkout:${checkoutHash}:${window}`)),db.collection('deliveryQuoteRateLimits').doc(hash(`network:${networkHash}:${window}`))];
  const rows=await Promise.all(refs.map(ref=>tx.get(ref))),counts=rows.map(row=>row.exists?row.data()?.count:0);
  if(counts.some(n=>!Number.isSafeInteger(n)||n<0)||counts[0]>=6||counts[1]>=30)return false;
  refs.forEach((ref,i)=>tx.set(ref,{count:counts[i]+1,expiresAt:new Date((window+2)*60000)}));return true;
 });
}
/** Server-created quote only. Native cart/digest comes from shared checkout resolver, not browser totals. */
export async function persistCustomerQuoteClaim(claim:CustomerQuoteClaim):Promise<boolean>{
 const parsed=storedDeliveryQuoteSchema.safeParse(claim.quote);
 if(!parsed.success||!id(claim.quote.quoteRef)||!/^[a-f0-9]{64}$/.test(claim.tokenHash)||!/^[a-f0-9]{64}$/.test(claim.checkoutKeyHash)||!/^[a-f0-9]{64}$/.test(claim.requestDigest))return false;
 const db=getAdminDb();return db.runTransaction(async tx=>{
  const validation=currentSettings(tx,claim,assertDraftCurrent(tx,claim));
  const ref=db.collection('deliveryQuotes').doc(claim.quote.quoteRef),meta=ref.collection('customerClaims').doc('current');
  const [q,m]=await Promise.all([tx.get(ref),tx.get(meta),validation]);
  if(q.exists||m.exists||Date.now()<claim.quote.createdAtMs||Date.now()>=claim.quote.expiresAtMs)return false;
  const {quote,...metadata}=claim;
  tx.create(ref,quote);tx.create(meta,{...metadata,consumedByOrderId:null,expiresAt:new Date(quote.expiresAtMs)});return true;
 });
}
/** Caller uses same transaction as creating the order. Perform every other read before apply(). */
export async function prepareCustomerQuoteConsumption(tx:FirebaseFirestore.Transaction,proof:CustomerQuoteProof,current:AuthoritativeDraft,orderId:string){
 if(!id(proof.quoteId)||!id(orderId))throw Error('invalid_quote_claim');
 const ref=getAdminDb().collection('deliveryQuotes').doc(proof.quoteId),meta=ref.collection('customerClaims').doc('current');
 const [q,m]=await Promise.all([tx.get(ref),tx.get(meta)]);
 if(!q.exists||!m.exists)throw Error('quote_missing');
 const quote=storedDeliveryQuoteSchema.parse(q.data()),metadata=m.data()!;
 const claim={...metadata,quote} as CustomerQuoteClaim;
 if(!verifyCustomerQuoteClaim(claim,proof,current,Date.now())||metadata.consumedByOrderId!==null)throw Error('quote_claim_changed');
 await currentSettings(tx,claim,assertDraftCurrent(tx,claim));
 return {quote,apply(){if(Date.now()>=quote.expiresAtMs)throw Error('quote_expired');tx.update(meta,{consumedByOrderId:orderId,consumedAt:new Date()});}};
}
