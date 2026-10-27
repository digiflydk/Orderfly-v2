'use client';
import { CUSTOMER_IDENTITY_CHECKOUT_MESSAGE } from '@/lib/checkout-public-error';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { deliveryRoutingAttribution } from '@/lib/delivery/routing/attribution';

/** Public display projection only. The server must resolve and validate the
 * immutable quote again before accepting payment or creating a delivery. */
export type ManagedDeliveryQuoteView = {
  /** Server projection of immutable economics.route.source; display only. */
  routingSource?: string;
  quoteId: string;
  quoteToken: string;
  checkoutFingerprint: string;
  customerFeeMinor: number;
  checkoutTotalMinor: number;
  currency: string;
  expiresAtMs: number;
  deliveryInterval: {earliest: string;latest: string}|null;
};
export type ManagedQuoteState =
  | {kind:'idle'}
  | {kind:'loading'}
  | {kind:'unavailable';reason:string;pickupAllowed:boolean}
  | {kind:'ready';quote:ManagedDeliveryQuoteView};
export type ManagedQuoteAcceptance = {quoteId:string;quoteToken:string;checkoutFingerprint:string;customerFeeMinor:number;checkoutTotalMinor:number;currency:string};
const messages:Record<string,string>={
 customer_identity_conflict:CUSTOMER_IDENTITY_CHECKOUT_MESSAGE,
 closed:'Restauranten har lukket for levering på det valgte tidspunkt.',
 unsupported_schedule:'Vælg et senere leveringstidspunkt, så der er tid til klargøring og transport.',
 rate_limited:'Vent lidt, før du beregner levering igen.',
 quote_changed:'Kurven eller leveringsoplysningerne er ændret. Hent en ny leveringspris.',
 paused:'Restauranten har midlertidigt sat levering på pause.',
 outside_area:'Adressen ligger uden for restaurantens leveringsområde.',
 invalid_address:'Kontrollér leveringsadressen, husnummeret og postnummeret.',
 minimum_not_met:'Varebeløbet efter rabatter er under minimumskøbet for levering.',
 caps_conflict:'Levering kan ikke tilbydes til denne adresse med de gældende priser.',
 route_unavailable:'Vi kunne ikke beregne ruten til adressen. Prøv igen eller vælg afhentning.',
 quote_expired:'Leveringstilbuddet er udløbet. Hent en ny pris før betaling.',
 provider_unconfigured:'Restauranten tilbyder endnu ikke levering gennem denne løsning.',
};
export function validManagedDeliveryQuote(q:ManagedDeliveryQuoteView){return !!q&&typeof q.quoteId==='string'&&q.quoteId.length>0&&q.quoteId.length<=128&&typeof q.quoteToken==='string'&&q.quoteToken.length>0&&q.quoteToken.length<=2048&&typeof q.checkoutFingerprint==='string'&&q.checkoutFingerprint.length>0&&q.checkoutFingerprint.length<=256&&Number.isSafeInteger(q.customerFeeMinor)&&q.customerFeeMinor>=0&&Number.isSafeInteger(q.checkoutTotalMinor)&&q.checkoutTotalMinor>=q.customerFeeMinor&&/^[A-Z]{3}$/.test(q.currency)&&Number.isSafeInteger(q.expiresAtMs)&&q.expiresAtMs>0&&(!q.deliveryInterval||(Number.isFinite(Date.parse(q.deliveryInterval.earliest))&&Number.isFinite(Date.parse(q.deliveryInterval.latest))&&Date.parse(q.deliveryInterval.earliest)<=Date.parse(q.deliveryInterval.latest)));}
const money=(amount:number,currency:string)=>new Intl.NumberFormat('da-DK',{style:'currency',currency}).format(amount/100);
const date=(value:string)=>new Intl.DateTimeFormat('da-DK',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Copenhagen'}).format(new Date(value));
export function ManagedDeliveryQuote({enabled,state,checkoutFingerprint,accepted,previousFeeMinor,onRequest,onAccept,onPickup,locked=false}: {
 enabled:boolean;state:ManagedQuoteState;checkoutFingerprint:string;accepted:ManagedQuoteAcceptance|null;previousFeeMinor?:number|null;
 onRequest:()=>void;onAccept:(value:ManagedQuoteAcceptance|null)=>void;onPickup:()=>void;locked?:boolean;
}) {
 const [now,setNow]=useState(()=>Date.now());const invalidated=useRef<string|null>(null);
 useEffect(()=>{if(!enabled)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[enabled]);
 const q=state.kind==='ready'?state.quote:null;
 const attribution=deliveryRoutingAttribution(q?.routingSource);
 const valid=!!q&&validManagedDeliveryQuote(q)&&q.checkoutFingerprint===checkoutFingerprint&&q.expiresAtMs>now;
 const acceptedCurrent=valid&&!!accepted&&accepted.quoteId===q!.quoteId&&accepted.quoteToken===q!.quoteToken&&accepted.checkoutFingerprint===q!.checkoutFingerprint&&accepted.customerFeeMinor===q!.customerFeeMinor&&accepted.checkoutTotalMinor===q!.checkoutTotalMinor&&accepted.currency===q!.currency;
 useEffect(()=>{if(!enabled||!accepted||acceptedCurrent){invalidated.current=null;return;}const key=JSON.stringify(accepted);if(invalidated.current!==key){invalidated.current=key;onAccept(null);}},[enabled,accepted,acceptedCurrent,onAccept]);
 if(!enabled)return null;
 const expired=q&&validManagedDeliveryQuote(q)&&q.expiresAtMs<=now;
 const changed=q&&q.checkoutFingerprint!==checkoutFingerprint;
 return <section className="space-y-3 rounded-lg border p-4" aria-labelledby="managed-delivery-heading" aria-busy={state.kind==='loading'}>
  <h3 id="managed-delivery-heading" className="text-lg font-semibold">Leveringspris og tidspunkt</h3>
  {state.kind==='loading'?<p role="status">Vi kontrollerer leveringsadressen og henter en pris…</p>:state.kind==='unavailable'?<p role="alert">{messages[state.reason]||'Vi kan ikke bekræfte levering lige nu. Prøv igen eller vælg afhentning.'}</p>:!valid?<p role="status">{expired?messages.quote_expired:changed?'Adressen, kurven eller tidspunktet er ændret. Hent en ny leveringspris.':'Kontrollér adressen og hent leveringsprisen, før du fortsætter til betaling.'}</p>:<>
   <dl className="space-y-2"><div className="flex flex-wrap justify-between gap-2"><dt>Levering</dt><dd className="font-semibold">{money(q!.customerFeeMinor,q!.currency)}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt>Samlet beløb inkl. levering</dt><dd className="font-semibold">{money(q!.checkoutTotalMinor,q!.currency)}</dd></div></dl>
   <p>{q!.deliveryInterval?`Forventet levering: ${date(q!.deliveryInterval.earliest)} – ${date(q!.deliveryInterval.latest)}.`:'Leveringstidspunktet er endnu ikke oplyst.'}</p>
   {attribution&&<p className="text-sm text-muted-foreground"><a className="underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href={attribution.providerUrl}>{attribution.providerLabel}</a>{' | '}<a className="underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href={attribution.dataUrl}>{attribution.dataLabel}</a></p>}
   {previousFeeMinor!==null&&previousFeeMinor!==undefined&&q!.customerFeeMinor>previousFeeMinor&&<p role="alert">Leveringsprisen er steget. Godkend den nye pris, før du betaler.</p>}
   <label className="flex min-h-11 items-start gap-3 rounded border p-3"><input className="mt-1 h-5 w-5" type="checkbox" checked={!!acceptedCurrent} disabled={locked} onChange={e=>onAccept(e.target.checked?{quoteId:q!.quoteId,quoteToken:q!.quoteToken,checkoutFingerprint:q!.checkoutFingerprint,customerFeeMinor:q!.customerFeeMinor,checkoutTotalMinor:q!.checkoutTotalMinor,currency:q!.currency}:null)}/><span>Jeg accepterer leveringsprisen på {money(q!.customerFeeMinor,q!.currency)} og det samlede beløb på {money(q!.checkoutTotalMinor,q!.currency)}.</span></label>
  </>}
  <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" className="min-h-11" disabled={locked||state.kind==='loading'} onClick={onRequest}>{valid?'Opdater leveringspris':'Hent leveringspris'}</Button>{(state.kind!=='unavailable'||state.pickupAllowed)&&<Button type="button" variant="outline" className="min-h-11" disabled={locked} onClick={onPickup}>Vælg afhentning i stedet</Button>}</div>
 </section>;
}
