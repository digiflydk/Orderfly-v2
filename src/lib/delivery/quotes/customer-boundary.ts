import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { storedDeliveryQuoteSchema, type StoredDeliveryQuote } from './schema';
import { validateQuoteAcceptance, type QuoteBindingInput } from './binding';
import type {CustomerQuoteFailure} from './customer-failure';
export type {CustomerQuoteFailure} from './customer-failure';

export type CustomerQuoteDto = {ok:true;quoteId:string;quoteToken:string;checkoutFingerprint:string;customerFeeMinor:number;currency:string;checkoutTotalMinor:number;deliveryInterval:{earliest:string;latest:string}|null;expiresAtMs:number;routingSource?:string};
export type AuthoritativeDraft = {restaurantFingerprint?:string;checkoutKeyHash:string;binding:QuoteBindingInput;requestDigest:string;itemSubtotalAfterDiscountMinor:number;bagFeeMinor:number;adminFeeMinor:number;draftRevision:number;addressRevision:number};
export type CustomerQuoteProof = {quoteId:string;quoteToken:string;checkoutFingerprint:string;acceptedFeeMinor:number};
export type CustomerQuoteClaim = {quote:StoredDeliveryQuote;tokenHash:string;checkoutKeyHash:string;requestDigest:string;draftRevision:number;addressRevision:number};
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
export function checkoutKeyHash(key:string):string {if(!/^[a-f0-9]{64}$/.test(key))throw Error('invalid_checkout_key');return digest(`delivery-checkout:${key}`);}
export function quoteTokenHash(token:string):string {if(!/^[a-f0-9]{64}$/.test(token))throw Error('invalid_quote_token');return digest(`delivery-quote:${token}`);}
function validDraft(d:AuthoritativeDraft):boolean{return !!d && /^[a-f0-9]{64}$/.test(d.checkoutKeyHash)&&/^[a-f0-9]{64}$/.test(d.requestDigest)&&[d.itemSubtotalAfterDiscountMinor,d.bagFeeMinor,d.adminFeeMinor,d.draftRevision,d.addressRevision].every(n=>Number.isSafeInteger(n)&&n>=0);}
const failure=(code:CustomerQuoteFailure['code']):CustomerQuoteFailure=>({ok:false,code,message:code==='rate_limited'?'Vent lidt, før du beregner levering igen.':code==='quote_changed'?'Kurven eller leveringsoplysningerne er ændret. Beregn levering igen.':'Levering er ikke tilgængelig lige nu. Vælg afhentning.'});
/** Dependencies are native server implementations, never request-provided callbacks. Rate writes commit BEFORE provider calls. */
export async function issueCustomerQuote(draft:AuthoritativeDraft, deps:{
  reserveRate:()=>Promise<boolean>;
  createQuote:()=>Promise<StoredDeliveryQuote|CustomerQuoteFailure|null>;
  commitIfCurrent:(claim:CustomerQuoteClaim)=>Promise<boolean>;
  now:()=>number;
  onFailure?:(error:unknown)=>void;
}):Promise<CustomerQuoteDto|CustomerQuoteFailure>{
  try{
    if(!validDraft(draft))return failure('invalid_request');
    if(!await deps.reserveRate())return failure('rate_limited');
    const raw=await deps.createQuote();if(!raw)return failure('delivery_unavailable');
    if('ok' in raw && raw.ok===false)return raw;
    const quote=storedDeliveryQuoteSchema.parse(raw);
    if(quote.economics.itemSubtotalAfterDiscountMinor!==draft.itemSubtotalAfterDiscountMinor
      || validateQuoteAcceptance(quote,draft.binding,deps.now(),quote.economics.customerFee.amountMinor)!=='valid')return failure('quote_changed');
    const total=draft.itemSubtotalAfterDiscountMinor+draft.bagFeeMinor+draft.adminFeeMinor+quote.economics.customerFee.amountMinor;
    if(!Number.isSafeInteger(total))return failure('invalid_request');
    const token=randomBytes(32).toString('hex');
    const claim={quote,tokenHash:quoteTokenHash(token),checkoutKeyHash:draft.checkoutKeyHash,requestDigest:draft.requestDigest,draftRevision:draft.draftRevision,addressRevision:draft.addressRevision};
    // Native transaction must reload authoritative scope/cart/address/config and compare all supplied revisions/digests.
    if(!await deps.commitIfCurrent(claim))return failure('quote_changed');
    if(deps.now()>=quote.expiresAtMs)return failure('quote_changed');
    return {ok:true,quoteId:quote.quoteRef,quoteToken:token,checkoutFingerprint:quote.fingerprint,customerFeeMinor:quote.economics.customerFee.amountMinor,currency:quote.economics.customerFee.currency,checkoutTotalMinor:total,deliveryInterval:quote.providerQuote.deliveryInterval,expiresAtMs:quote.expiresAtMs,routingSource:quote.economics.route.source};
  }catch(error){deps.onFailure?.(error);return failure('delivery_unavailable');}
}
/** Pure proof check invoked inside native final-checkout transaction, followed by one-time atomic claim. */
export function verifyCustomerQuoteClaim(claim:CustomerQuoteClaim,proof:CustomerQuoteProof,current:AuthoritativeDraft,now:number):boolean {
  try{
    if(!validDraft(current)||!claim||!proof||!storedDeliveryQuoteSchema.safeParse(claim.quote).success||!/^[a-f0-9]{64}$/.test(claim.tokenHash))return false;
    const tokenHash=quoteTokenHash(proof.quoteToken);
    return timingSafeEqual(Buffer.from(tokenHash,'hex'),Buffer.from(claim.tokenHash,'hex'))
      && claim.quote.quoteRef===proof.quoteId&&claim.quote.fingerprint===proof.checkoutFingerprint
      && claim.checkoutKeyHash===current.checkoutKeyHash&&claim.requestDigest===current.requestDigest
      && claim.draftRevision===current.draftRevision&&claim.addressRevision===current.addressRevision
      && claim.quote.economics.itemSubtotalAfterDiscountMinor===current.itemSubtotalAfterDiscountMinor
      && validateQuoteAcceptance(claim.quote,current.binding,now,proof.acceptedFeeMinor)==='valid';
  }catch{return false;}
}
