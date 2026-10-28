'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
type CancelResult='submitting'|'cancelled'|'not_cancellable'|'unknown'|'unsupported';
const messages:Record<CancelResult,string>={submitting:'Annulleringen behandles. Opdater ordren for at se resultatet.',cancelled:'Leveringen er annulleret hos leverandøren. Kundens betaling er ikke automatisk refunderet.',not_cancellable:'Leveringen kan ikke længere annulleres. Opdater ordren og kontrollér status.',unknown:'Resultatet af annulleringen er ukendt. Start ikke en ny annullering. Opdater ordren, eller kontakt den ansvarlige.',unsupported:'Leverandøren understøtter ikke denne annullering. Kontakt den ansvarlige.'};
export function DeliveryCancel({brandId,locationId,orderId,available,persistedState=null,onRefresh}:{brandId:string;locationId:string;orderId:string;available:boolean;persistedState?:CancelResult|null;onRefresh:()=>void}){
 const [open,setOpen]=useState(false),[reason,setReason]=useState(''),[acknowledged,setAcknowledged]=useState(false),[busy,setBusy]=useState(false),[localResult,setResult]=useState<CancelResult|null>(null);
 const result=persistedState??localResult;
 const lock=useRef(false),requestId=useRef<string|null>(null);
 async function cancel(){
  if(lock.current||busy||result||!available||!acknowledged||!reason.trim()||reason.length>500)return;
  lock.current=true;setBusy(true);requestId.current??=crypto.randomUUID();
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch('/api/delivery/cancel',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',signal:controller.signal,body:JSON.stringify({brandId,locationId,orderId,requestId:requestId.current,operatorReason:reason.trim()})});
   const value=await response.json();
   if(!response.ok||!value||!Object.hasOwn(messages,value.state)||typeof value.changed!=='boolean'||typeof value.feeKnown!=='boolean'){setResult('unknown');return;}
   setResult(value.state);
  }catch{setResult('unknown');}finally{clearTimeout(timeout);setBusy(false);}
 }
 return <section className="space-y-3 rounded border p-4"><h4 className="font-semibold">Annuller kurérlevering</h4><p>Dette annullerer kun kurérleveringen. Refundering af kundens betaling håndteres særskilt.</p>
 {!available&&!result&&<p>Annullering er ikke tilgængelig for denne ordre eller din adgang. Leveringer kan ikke annulleres her efter afhentning.</p>}
 {available&&!open&&!result&&<Button type="button" variant="outline" className="min-h-11" onClick={()=>setOpen(true)}>Annuller levering</Button>}
 {open&&!result&&<fieldset disabled={busy||!available} className="space-y-3"><legend className="font-semibold">Bekræft annullering</legend><p>Et annulleringsgebyr kan blive opkrævet. Gebyrets størrelse er ikke kendt her.</p><label className="block">Begrundelse<textarea className="mt-1 min-h-24 w-full rounded border bg-background p-3" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><label className="flex min-h-11 items-start gap-3"><input className="mt-1 h-5 w-5" type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/><span>Jeg accepterer, at annulleringen kan medføre et gebyr, og at kundens betaling ikke automatisk refunderes.</span></label><div className="flex flex-wrap gap-3"><Button type="button" variant="destructive" className="min-h-11" disabled={!reason.trim()||!acknowledged||busy} onClick={cancel}>{busy?'Sender annullering…':'Bekræft annullering af levering'}</Button><Button type="button" variant="outline" className="min-h-11" onClick={()=>setOpen(false)}>Fortryd</Button></div></fieldset>}
 {busy&&<p role="status">Afventer svar fra leverandøren. Start ikke en ny annullering.</p>}
 {result&&<div className="space-y-3"><p role={result==='cancelled'?'status':'alert'}>{messages[result]}</p><Button type="button" variant="outline" className="min-h-11" onClick={onRefresh}>Opdater ordren</Button></div>}
 </section>;
}
