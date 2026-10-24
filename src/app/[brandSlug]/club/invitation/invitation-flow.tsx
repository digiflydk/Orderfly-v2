'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { portalRequest } from '../portal-api';
type Details={groupName:string;percentage:number;terms:string;termsVersion:string;locations:{id:string;name:string}[];startsAt:number|null;expiresAt:number|null;locationScope:{mode:'all'|'selected';locationIds:string[]}};
export function DiscountInvitationFlow({slug,base}:{slug:string;base:string}){
 const token=useRef<string|null>(null),started=useRef(false);
 const [details,setDetails]=useState<Details|null>(null),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(started.current)return;started.current=true;
  const hash=window.location.hash;window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);
  const match=/^#token=([a-f0-9]{64})$/.exec(hash);
  if(!match){setError('Invitationen virker ikke længere. Bed udstederen om en ny invitation.');return;}
  token.current=match[1];
  void portalRequest<Details>(slug,'discount-invitation',{token:token.current}).then(answer=>{
   if(answer.ok)setDetails(answer.data);
   else setError('Invitationen er udløbet eller ændret. Bed udstederen om en ny invitation.');
  });
 },[slug]);
 async function activate(event:React.FormEvent){
  event.preventDefault();if(!accepted||!details||!token.current)return;
  setBusy(true);setError('');
  const answer=await portalRequest(slug,'discount-invitation/accept',{token:token.current,termsAccepted:true,termsVersion:details.termsVersion});
  if(answer.ok){token.current=null;window.location.replace(base);return;}
  setBusy(false);setError('Kortet kunne ikke aktiveres. Invitationen kan være udløbet eller ændret. Kontakt udstederen, hvis det fortsætter.');
 }
 return <section className="flex flex-col gap-5" aria-labelledby="discount-invitation-title">
  <h1 id="discount-invitation-title" className="text-center text-3xl">Dit personlige rabatkort</h1>
  {error&&<p role="alert">{error}</p>}
  {!details&&!error&&<p role="status">Henter invitation…</p>}
  {details&&<form onSubmit={activate} className="flex flex-col gap-5">
   <div className="rounded-xl border p-5 text-center"><p>{details.groupName}</p><p className="text-4xl">{details.percentage.toLocaleString('da-DK')} % rabat</p><p>{details.locationScope.mode==='all'?'Gælder alle brandets lokationer':'Gælder udvalgte lokationer hos brandet'}</p></div>
   {details.locations.length>0&&<ul aria-label="Lokationer">{details.locations.map(location=><li key={location.id}>{location.name}</li>)}</ul>}
   <p>{details.startsAt!==null?`Gyldigt fra ${new Date(details.startsAt).toLocaleDateString('da-DK')}. `:''}{details.expiresAt!==null?`Gyldigt til ${new Date(details.expiresAt).toLocaleDateString('da-DK')}.`:'Gyldigt indtil udstederen deaktiverer kortet.'}</p>
   <p>{details.terms}</p>
   <label className="flex items-start gap-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} className="mt-1 h-5 w-5"/><span>Jeg accepterer vilkårene for det personlige rabatkort.</span></label>
   <Button type="submit" variant="brand" size="lg" disabled={!accepted||busy}>{busy?'Aktiverer…':'Aktivér mit rabatkort'}</Button>
  </form>}
 </section>;
}
