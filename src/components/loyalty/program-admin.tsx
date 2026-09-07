'use client';
import { useEffect,useState } from 'react';
import type { User } from 'firebase/auth';
import { LoyaltyAuth } from './auth-panel';
import { getPublicLoyaltyProgram,saveLoyaltyProgram,reconcileLoyaltyCustomer } from '@/app/loyalty/actions';
import { defaultProgram } from '@/lib/loyalty/model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ProgramAdmin({brands}:{brands:{id:string;name:string}[]}) {
  const [customerId,setCustomerId]=useState('');
  const [user,setUser]=useState<User|null>(null),[brandId,setBrand]=useState(brands[0]?.id||''),[program,setProgram]=useState(defaultProgram),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
  useEffect(()=>{let live=true;setLoaded(false);if(brandId)getPublicLoyaltyProgram(brandId).then(p=>{if(live){setProgram(p);setLoaded(true);}}).catch(()=>{if(live)setMessage('Kunne ikke hente indstillinger.');});return()=>{live=false;};},[brandId]);
  async function save(){setBusy(true);setMessage('');try{if(!user)throw new Error('Log ind først.');await saveLoyaltyProgram(brandId,program,await user.getIdToken());setMessage('Gemt.');}catch(e){setMessage(e instanceof Error?e.message:'Kunne ikke gemme.');}finally{setBusy(false);}}
  return <section className="space-y-4 rounded-lg border p-4"><h2 className="text-xl font-semibold">Belønninger pr. brand</h2><p>Kun den godkendte loyaltyadministrator kan ændre indstillinger. Brug samme login til kundescore nedenfor.</p><LoyaltyAuth onUser={setUser}/>
    <label className="block">Brand<select disabled={busy} className="ml-3 border p-2" value={brandId} onChange={e=>setBrand(e.target.value)}>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    {loaded&&<><label className="block"><input type="checkbox" checked={program.enabled} onChange={e=>setProgram({...program,enabled:e.target.checked})}/> Aktivér optjening og indløsning</label>
    {([['earnPercent','Optjening (%)'],['minRedeemOre','Minimum indløsning (øre)'],['maxRedeemPercent','Maksimal indløsning (% af varebeløb)']] as const).map(([key,label])=><label className="block" key={key}>{label}<Input type="number" value={program[key]} onChange={e=>setProgram({...program,[key]:Number(e.target.value)})}/></label>)}
    <p>1 point = 1 øre. Ingen udløbsdato. Gælder fremtidige køb fra bekræftede kundekonti. Ingen historisk tildeling. Kurvrabatter kan ikke kombineres med indløsning.</p>
    <Button type="button" disabled={!user||busy} onClick={save}>{busy?'Gemmer…':'Gem belønningsprogram'}</Button>
    <details><summary>Genberegn historiske kundedata</summary><p>Brug kundens ID fra kundemodulet. Genberegner score, ordreantal og forbrug fra betalte ordrer og registrerede refunderinger. Tildeler ingen historisk saldo.</p><label>Kunde-ID<Input value={customerId} onChange={e=>setCustomerId(e.target.value)}/></label><Button type="button" disabled={!user||busy||!customerId} onClick={async()=>{setBusy(true);try{const result=await reconcileLoyaltyCustomer(brandId,customerId,await user!.getIdToken());setMessage(`Genberegnet: ${result.totalOrders} ordrer, ${result.totalSpend.toFixed(2)} kr., score ${result.score}.`);}catch(e){setMessage(e instanceof Error?e.message:'Kunne ikke genberegne.');}finally{setBusy(false);}}}>Genberegn kunde</Button></details>
    </>}{message&&<p role="status">{message}</p>}
  </section>;
}
