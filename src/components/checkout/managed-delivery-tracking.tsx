'use client';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import type { CustomerDeliveryTracking } from '@/lib/delivery/tracking';
import { customerDeliveryEstimate } from '@/lib/delivery/customer-eta';
export type ManagedDeliveryTrackingView=CustomerDeliveryTracking;
const states:Record<NonNullable<ManagedDeliveryTrackingView['deliveryStatus']>,string>={booked:'Leveringen er bestilt',courier_assigned:'En kurér er tildelt',courier_to_pickup:'Kurér på vej til restauranten',picked_up:'Kurér har afhentet din ordre',delivered:'Din ordre er leveret',cancelled:'Leveringen er annulleret',failed:'Leveringen kunne ikke gennemføres'};
const format=(s:string)=>new Intl.DateTimeFormat('da-DK',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Copenhagen'}).format(new Date(s));
const isTime=(s:unknown):s is string=>typeof s==='string'&&Number.isFinite(Date.parse(s));
function safeTracking(value:string|null){try{if(!value)return null;const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
/** Display only authenticated, ownership-checked server projection. The parent
 * owns polling and must never obtain tracking by a guessed public order ID. */
export function ManagedDeliveryTracking({enabled,orderId,data,loading=false,error=false,onRefresh=()=>window.location.reload(),variant='customer',fallbackDeliveryTime}:{enabled:boolean;orderId:string;data:ManagedDeliveryTrackingView|null;loading?:boolean;error?:boolean;onRefresh?:()=>void;variant?:'customer'|'merchant';fallbackDeliveryTime?:string|null}){
 const headingId=useId();
 if(!enabled)return null;
 const valid=!!data&&data.orderId===orderId&&(data.updatedAt===null||isTime(data.updatedAt))&&['pending','submitting','accepted','rejected','unknown'].includes(data.bookingState)&&['pending','paid','refunded','failed'].includes(data.paymentStatus)&&(data.deliveryStatus===null||Object.hasOwn(states,data.deliveryStatus));
 const cancelled=valid&&data!.deliveryStatus==='cancelled';
 const tracking=valid&&!cancelled?safeTracking(data!.trackingUrl):null;
 const providerEta=valid&&!cancelled?customerDeliveryEstimate(data!.deliveryInterval):null;
 // A saved native estimate is not provider confirmation. Never revive cancelled,
 // failed, refunded or delivered orders, or turn an ASAP label into a clock time.
 const fallbackAllowed=variant==='customer'&&valid&&data!.deliveryInterval===null&&data!.bookingState!=='rejected'
  &&!['failed','refunded'].includes(data!.paymentStatus)&&!['cancelled','failed','delivered'].includes(data!.deliveryStatus||'')
  &&!['submitting','unknown','cancelled'].includes(data!.cancellationState||'');
 const fallbackValid=isTime(fallbackDeliveryTime)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(fallbackDeliveryTime)
  &&new Date(fallbackDeliveryTime).toISOString().slice(0,19)===fallbackDeliveryTime.slice(0,19);
 const fallbackEta=fallbackAllowed&&fallbackValid?customerDeliveryEstimate({earliest:fallbackDeliveryTime!,latest:fallbackDeliveryTime!}):null;
 const eta=providerEta??fallbackEta;
 return <section className="space-y-3 rounded-lg border p-4" aria-labelledby={headingId} aria-busy={loading}><h2 id={headingId} className="text-xl font-semibold">{variant==='merchant'?'Leveringsstatus':'Følg din levering'}</h2>
 {error&&<p role="alert">Leveringsstatus kunne ikke opdateres. Oplysningerne kan være forsinkede.</p>}
 {!valid?<p role="status">{loading?'Henter leveringsstatus…':'Vi kan ikke vise en bekræftet leveringsstatus lige nu.'}</p>:<>
 <p role="status" className="font-semibold">{data!.bookingState==='unknown'?'Vi afklarer, om leveringen er bestilt. Start ikke en ny bestilling.':data!.bookingState==='rejected'?'Leveringen kunne ikke bestilles.':data!.bookingState!=='accepted'?'Vi afventer bekræftelse fra leverandøren.':data!.deliveryStatus?states[data!.deliveryStatus]:'Leveringen er bestilt. Vi afventer kurérstatus.'}</p>
 {(data!.cancellationState==='unknown'||data!.cancellationState==='submitting')&&<p role="alert">{data!.cancellationState==='unknown'?'Resultatet af annulleringen er ukendt. Kontakt restauranten for afklaring.':'Annulleringen behandles. Afvent bekræftelse fra restauranten.'}</p>}
 <p>Betaling: {data!.paymentStatus==='paid'?'Betalt':data!.paymentStatus==='refunded'?'Refunderet':data!.paymentStatus==='failed'?'Mislykket':'Afventer'}</p>
 {eta&&<p>{providerEta?'Forventet levering:':'Foreløbigt forventet levering:'} {eta}.</p>}
 <p className="text-sm text-muted-foreground">{data!.updatedAt?`Senest opdateret: ${format(data!.updatedAt)}.`:'Opdateringstidspunktet er ikke oplyst.'}</p>
 {variant==='merchant'&&!cancelled&&<p>{data!.pickupReliable&&data!.pickupInterval&&isTime(data!.pickupInterval.earliest)&&isTime(data!.pickupInterval.latest)?`Bekræftet afhentningsinterval: ${format(data!.pickupInterval.earliest)} – ${format(data!.pickupInterval.latest)}.`:'Kurérens afhentningstid er endnu ikke bekræftet.'}</p>}
 {tracking&&data!.bookingState==='accepted'&&<a href={tracking} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded border px-4 underline focus-visible:outline">Åbn kurérens tracking (nyt vindue)</a>}
 {(data!.bookingState==='unknown'||data!.bookingState==='rejected'||data!.deliveryStatus==='failed')&&<p>Kontakt restauranten, hvis du har brug for hjælp. En betaling alene bekræfter ikke, at en kurér er bestilt.</p>}
 </>}
 <Button type="button" variant="outline" className="min-h-11" disabled={loading} onClick={onRefresh}>Opdater leveringsstatus</Button>
 </section>;
}
