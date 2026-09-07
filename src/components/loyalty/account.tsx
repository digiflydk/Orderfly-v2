'use client';
import { useEffect,useState } from 'react';
import type { User } from 'firebase/auth';
import { LoyaltyAuth } from './auth-panel';
import { getLoyaltyAccount } from '@/app/loyalty/actions';
import { Button } from '@/components/ui/button';
export const money=(value:number)=>(value/100).toLocaleString('da-DK',{style:'currency',currency:'DKK'});

export function LoyaltyAccount({brandId,goodsOre=0,blocked=false,onChange}:{brandId:string;goodsOre?:number;blocked?:boolean;onChange?:(selection:{user:User;redeemOre:number}|null)=>void}) {
  const [user,setUser]=useState<User|null>(null),[account,setAccount]=useState<Awaited<ReturnType<typeof getLoyaltyAccount>>|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState(false),[refresh,setRefresh]=useState(0);
  useEffect(()=>{let live=true;setAccount(null);setSelected(false);setError('');if(user)user.getIdToken().then(t=>getLoyaltyAccount(brandId,t)).then(a=>{if(live)setAccount(a);}).catch(()=>{if(live)setError('Saldo kunne ikke hentes. Prøv igen.');});return()=>{live=false;};},[user,brandId,refresh]);
  const p=account?.program;
  const cap=p?Math.min(account!.availableOre,Math.floor(goodsOre*p.maxRedeemPercent/100)):0;
  const redeem=selected&&!blocked&&p?.enabled&&cap>=p.minRedeemOre?cap:0;
  useEffect(()=>{onChange?.(user&&account?.program.enabled?{user,redeemOre:redeem}:null);},[user,account,redeem,onChange]);
  return <section className="space-y-4 rounded-lg border p-4">
    <h2 className="text-xl font-semibold">Loyalty</h2><LoyaltyAuth onUser={setUser}/>
    {user&&!account&&!error&&<p role="status">Henter saldo…</p>}{error&&<p role="alert">{error}</p>}
    {user&&<Button type="button" variant="outline" onClick={()=>setRefresh(v=>v+1)}>Opdater saldo</Button>}
    {account&&<><p>Tilgængelig saldo: <strong>{money(account.availableOre)}</strong>{account.heldOre>0&&` (${money(account.heldOre)} reserveret i checkout)`}</p>
      {account.balanceOre<0&&<p>Saldoen er korrigeret efter refundering. Ny optjening modregnes, før saldoen kan bruges.</p>}
      {p?.enabled?<p>Optjen {p.earnPercent}% af varernes pris efter rabatter. Gebyrer og levering giver ingen optjening. Saldoen udløber ikke. Minimum {money(p.minRedeemOre)} pr. indløsning, højst {p.maxRedeemPercent}% af varebeløbet. Gælder kun dette brand.</p>:<p>Der er ikke et aktivt loyaltyprogram for dette brand.</p>}
      {onChange&&p?.enabled&&<>{blocked?<p>Saldo kan ikke kombineres med kurvrabat eller rabatkode.</p>:<label className="flex gap-2"><input type="checkbox" checked={redeem>0} disabled={cap<p.minRedeemOre} onChange={e=>setSelected(e.target.checked)}/>Brug {money(cap>=p.minRedeemOre?cap:0)} af min saldo</label>}<p>Forventet optjening: {money(Math.floor((goodsOre-redeem)*p.earnPercent/100))}. Tilføjes efter betaling.</p></>}
      <h3 className="font-semibold">Seneste 30 bevægelser</h3><ul>{account.history.map((entry:any)=><li key={entry.id}>{new Date(entry.at).toLocaleDateString('da-DK')} · {({reserved:'Reserveret',paid:'Køb',released:'Frigivet',refund:'Refundering'} as Record<string,string>)[entry.kind]||entry.kind} · {money(entry.amountOre)} · {entry.orderId}</li>)}</ul>
    </>}
  </section>;
}
