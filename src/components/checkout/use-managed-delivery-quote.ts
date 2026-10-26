'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { validManagedDeliveryQuote, type ManagedDeliveryQuoteView, type ManagedQuoteState, type ManagedQuoteAcceptance } from './managed-delivery-quote';
export type CustomerQuoteResult=({ok:true}&ManagedDeliveryQuoteView)|{ok:false;code:string;message?:string};
/** Endpoint injected by the real checkout integration, never inferred here.
 * requestIdentity must cover every cart/address/time/discount/scope input. */
export function useManagedDeliveryQuote<T>({enabled,requestIdentity,input,requestQuote}: {enabled:boolean;requestIdentity:string;input:T|null;requestQuote:(input:T&{checkoutKey:string})=>Promise<CustomerQuoteResult>}) {
 const [stored,setStored]=useState<{identity:string;state:ManagedQuoteState}>({identity:requestIdentity,state:{kind:'idle'}});
 const [accepted,setAccepted]=useState<ManagedQuoteAcceptance|null>(null);
 const [previousFeeMinor,setPreviousFeeMinor]=useState<number|null>(null);
 const identity=useRef(requestIdentity);identity.current=requestIdentity;
 const key=useRef<string|null>(null),sequence=useRef(0),pending=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;sequence.current++;};},[]);
 useEffect(()=>{sequence.current++;pending.current=false;setAccepted(null);setStored({identity:requestIdentity,state:{kind:'idle'}});},[enabled,requestIdentity]);
 const request=useCallback(async()=>{
  if(!enabled||!input||pending.current)return;
  if(!key.current)key.current=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
  const token=++sequence.current,expected=requestIdentity;pending.current=true;setAccepted(null);setStored({identity:expected,state:{kind:'loading'}});
  try{
   const result=await requestQuote({...input,checkoutKey:key.current});
   if(!mounted.current||token!==sequence.current||identity.current!==expected)return;
   if(result.ok&&validManagedDeliveryQuote(result)&&result.expiresAtMs>Date.now())setStored({identity:expected,state:{kind:'ready',quote:result}});
   else setStored({identity:expected,state:{kind:'unavailable',reason:result.ok?'quote_expired':result.code,pickupAllowed:true}});
  }catch{if(mounted.current&&token===sequence.current&&identity.current===expected)setStored({identity:expected,state:{kind:'unavailable',reason:'delivery_unavailable',pickupAllowed:true}});}
  finally{if(token===sequence.current)pending.current=false;}
 },[enabled,input,requestIdentity,requestQuote]);
 const state=enabled&&stored.identity===requestIdentity?stored.state:{kind:'idle'} as ManagedQuoteState;
 const accept=useCallback((value:ManagedQuoteAcceptance|null)=>{
  if(!value){setAccepted(null);return;}
  if(state.kind!=='ready'||!validManagedDeliveryQuote(state.quote)||state.quote.expiresAtMs<=Date.now()||value.quoteId!==state.quote.quoteId||value.quoteToken!==state.quote.quoteToken||value.checkoutFingerprint!==state.quote.checkoutFingerprint||value.customerFeeMinor!==state.quote.customerFeeMinor||value.checkoutTotalMinor!==state.quote.checkoutTotalMinor||value.currency!==state.quote.currency)return;
  setAccepted(value);setPreviousFeeMinor(value.customerFeeMinor);
 },[state]);
 const currentAcceptance=enabled&&stored.identity===requestIdentity&&state.kind==='ready'&&state.quote.expiresAtMs>Date.now()?accepted:null;
 return {state,accepted:currentAcceptance,accept,request,previousFeeMinor,checkoutKey:key.current};
}
