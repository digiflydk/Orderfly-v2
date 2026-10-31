'use client';
import {useEffect,useState} from 'react';
import {normalizeDanishDeliveryAddress} from '@/lib/delivery/quotes/address';
type Input={brandId:string;locationId:string;street:string;zipCode:string;city:string};
type Preview={routeReceipt?:string;baseFeeMinor:number;currency:string;minimumMinor:number;freeMinimumMinor:number|null;routingSource:string};
export function useDeliveryPricePreview(enabled:boolean,input:Input){
 const identity=JSON.stringify(input);const [stored,setStored]=useState<{identity:string;preview:Preview|null;done:boolean}|null>(null);
 let valid=false;try{normalizeDanishDeliveryAddress({street:input.street,postcode:input.zipCode,city:input.city,country:'DK'});valid=true;}catch{}
 useEffect(()=>{if(!enabled||!valid)return;let active=true;const controller=new AbortController();
 const timer=setTimeout(async()=>{const started=performance.now();const timeout=setTimeout(()=>controller.abort(),10000);try{const response=await fetch('/api/delivery/price-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:identity,signal:controller.signal});const p=await response.json();try{console.info('delivery_price_preview_timing',JSON.stringify({clientMs:Math.round(performance.now()-started),serverMs:Number.isFinite(p.serverMs)?p.serverMs:null}));}catch{};
 const preview=p.ok&&Number.isSafeInteger(p.baseFeeMinor)&&p.baseFeeMinor>=0&&p.currency==='DKK'&&Number.isSafeInteger(p.minimumMinor)&&(p.freeMinimumMinor===null||Number.isSafeInteger(p.freeMinimumMinor))?p:null;
 if(active)setStored({identity,preview,done:true});}catch{if(active)setStored({identity,preview:null,done:true});}finally{clearTimeout(timeout);}},250);
 return()=>{active=false;clearTimeout(timer);controller.abort();};},[enabled,valid,identity]);
 const current=stored?.identity===identity?stored:null;
 return {preview:enabled&&valid?current?.preview??null:null,pending:enabled&&valid&&!current?.done,done:!!current?.done};
}
