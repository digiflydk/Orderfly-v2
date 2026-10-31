'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { quoteTimingsSchema } from '@/lib/delivery/quotes/performance-schema';
import { validManagedDeliveryQuote, type ManagedDeliveryQuoteView, type ManagedQuoteState, type ManagedQuoteAcceptance } from './managed-delivery-quote';
export type CustomerQuoteResult=(({ok:true}&ManagedDeliveryQuoteView)|{ok:false;code:string;message?:string})&{timings?:unknown};
// Match the server's minimum remaining lifetime before opening hosted payment.
export const managedQuotePaymentWindowMs=60_000;
/** requestIdentity covers every cart/address/time/discount/scope input. Requests
 * are serialized because abandoning a server action does not stop provider I/O. */
export function useManagedDeliveryQuote<T>({enabled,requestIdentity,input,requestQuote,autoRequestReady=false,locked=false}: {enabled:boolean;requestIdentity:string;input:T|null;requestQuote:(input:T&{checkoutKey:string})=>Promise<CustomerQuoteResult>;autoRequestReady?:boolean;locked?:boolean}) {
 const [stored,setStored]=useState<{identity:string;state:ManagedQuoteState}>({identity:requestIdentity,state:{kind:'idle'}});
 const [previousFeeMinor,setPreviousFeeMinor]=useState<number|null>(null);
 const [wake,setWake]=useState(0),[now,setNow]=useState(()=>Date.now());
 const current=useRef({enabled,requestIdentity,input,requestQuote,autoRequestReady,locked});current.current={enabled,requestIdentity,input,requestQuote,autoRequestReady,locked};
 const key=useRef<string|null>(null),sequence=useRef(0),pending=useRef(false),mounted=useRef(true),attempted=useRef<string|null>(null),lastFee=useRef<number|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;sequence.current++;};},[]);
 useEffect(()=>{sequence.current++;attempted.current=null;setStored({identity:requestIdentity,state:{kind:'idle'}});},[enabled,requestIdentity]);
 const request=useCallback(async()=>{
  const snapshot=current.current;
  if(!snapshot.enabled||!snapshot.autoRequestReady||snapshot.locked||!snapshot.input||pending.current)return;
  if(!key.current)key.current=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
  const token=++sequence.current,expected=snapshot.requestIdentity;pending.current=true;attempted.current=expected;
  setStored({identity:expected,state:{kind:'loading'}});
  // Start at invocation, excluding typing debounce and time spent waiting for an
  // obsolete quote. The duration still includes network/server-action queueing.
  const started=performance.now();let clientDuration:number|undefined,timings:unknown;
  try{
   const result=await snapshot.requestQuote({...snapshot.input,checkoutKey:key.current});
   clientDuration=performance.now()-started;timings=result.timings;
   if(!mounted.current||token!==sequence.current||!current.current.enabled||current.current.requestIdentity!==expected)return;
   if(result.ok&&validManagedDeliveryQuote(result)&&result.expiresAtMs>Date.now()+managedQuotePaymentWindowMs){
    setPreviousFeeMinor(lastFee.current);lastFee.current=result.customerFeeMinor;
    setNow(Date.now());setStored({identity:expected,state:{kind:'ready',quote:result}});
   }else setStored({identity:expected,state:{kind:'unavailable',reason:result.ok?'quote_expired':result.code,pickupAllowed:false}});
  }catch{if(mounted.current&&token===sequence.current&&current.current.enabled&&current.current.requestIdentity===expected)setStored({identity:expected,state:{kind:'unavailable',reason:'delivery_unavailable',pickupAllowed:false}});}
  finally{
   // Timing diagnostics are numeric only and must never affect payment behavior.
   try {
    const elapsed=clientDuration??performance.now()-started;
    if(Number.isFinite(elapsed)&&elapsed>=0){
     const parsed=quoteTimingsSchema.safeParse(timings);
     console.info('delivery_quote_timing',JSON.stringify({clientMs:Math.round(elapsed),...(parsed.success?{serverMs:parsed.data.serverMs,stages:parsed.data.stages}:{})}));
    }
   } catch { /* Console availability is not checkout authority. */ }
   pending.current=false;if(mounted.current)setWake(value=>value+1);
  }
 },[]);
 useEffect(()=>{
  if(!enabled||!autoRequestReady||locked||pending.current||attempted.current===requestIdentity)return;
  const timer=setTimeout(()=>void request(),250);return()=>clearTimeout(timer);
 },[enabled,autoRequestReady,locked,requestIdentity,request,wake]);
 useEffect(()=>{if(!enabled)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[enabled]);
 const state:ManagedQuoteState=enabled&&stored.identity===requestIdentity?stored.state:{kind:'idle'};
 const quote=autoRequestReady&&state.kind==='ready'&&state.quote.expiresAtMs>Math.max(now,Date.now())+managedQuotePaymentWindowMs?state.quote:null;
 const paymentProof:ManagedQuoteAcceptance|null=quote?{quoteId:quote.quoteId,quoteToken:quote.quoteToken,checkoutFingerprint:quote.checkoutFingerprint,customerFeeMinor:quote.customerFeeMinor,checkoutTotalMinor:quote.checkoutTotalMinor,currency:quote.currency}:null;
 // Render feedback immediately, including debounce and a newer identity queued
 // behind an obsolete request. Failure/expiry stays explicit-retry only.
 const loadingPending=enabled&&autoRequestReady&&input!==null&&(state.kind==='loading'||!locked&&state.kind==='idle');
 return {state,paymentProof,request,previousFeeMinor,checkoutKey:key.current,loadingPending};
}
