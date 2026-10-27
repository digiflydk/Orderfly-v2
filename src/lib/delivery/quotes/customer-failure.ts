import {checkoutCustomerIdentityMessage} from '@/lib/checkout-public-error';
const publicReasons = ['closed','paused','outside_area','invalid_address','minimum_not_met','caps_conflict','route_unavailable','unsupported_schedule','provider_unconfigured','customer_identity_conflict'] as const;
type PublicReason = typeof publicReasons[number];
export type CustomerQuoteFailure = {ok:false;code:PublicReason|'delivery_unavailable'|'invalid_request'|'rate_limited'|'quote_changed';message:string};
/** Only fixed, customer-actionable codes may cross the server boundary. */
export function customerQuoteFailure(reason:unknown):CustomerQuoteFailure {
  const identityMessage=checkoutCustomerIdentityMessage(reason);
  if(identityMessage)return {ok:false,code:'customer_identity_conflict',message:identityMessage};
  if(reason instanceof Error)reason=reason.message;
  const aliases:Record<string,PublicReason>={delivery_kitchen_closed:'closed',ambiguous_delivery_address:'invalid_address',ambiguous_address:'invalid_address',routing_unavailable:'route_unavailable',routing_unconfigured:'route_unavailable',no_route:'route_unavailable'};
  const code=typeof reason==='string'?(Object.hasOwn(aliases,reason)?aliases[reason]:(publicReasons.includes(reason as PublicReason)?reason as PublicReason:'delivery_unavailable')):'delivery_unavailable';
  return {ok:false,code,message:'Levering kunne ikke bekræftes. Kontrollér adresse og tidspunkt, eller vælg afhentning.'};
}
