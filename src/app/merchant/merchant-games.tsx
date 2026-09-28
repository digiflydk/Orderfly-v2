'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { redeemMerchantGameCode } from './actions';

export type MerchantVoucher={id:string;date:string|null;name:string;email:string;phone:string;code:string;prize:string;status:string;redeemable:boolean};
type Location={id:string;name:string;canRedeem:boolean};
const date=(value:string|null)=>value?new Intl.DateTimeFormat('da-DK',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Copenhagen'}).format(new Date(value)):'—';

export function MerchantGames({brands,brandId,locations,locationId,rows}:{brands:{id:string;name:string}[];brandId:string;locations:Location[];locationId:string;rows:MerchantVoucher[]}){
  const router=useRouter(),[search,setSearch]=useState(''),[selected,setSelected]=useState<MerchantVoucher|null>(null),[amount,setAmount]=useState(''),[pending,setPending]=useState(false),[notice,setNotice]=useState('');
  const current=locations.find(row=>row.id===locationId);
  const visible=useMemo(()=>rows.filter(row=>`${row.code} ${row.name} ${row.email} ${row.phone}`.toLocaleLowerCase('da-DK').includes(search.trim().toLocaleLowerCase('da-DK'))),[rows,search]);
  const switchScope=(brand:string,location?:string)=>router.push(`/merchant/redeem?brand=${encodeURIComponent(brand)}${location?`&location=${encodeURIComponent(location)}`:''}`);
  async function redeem(){
    if(!selected||!current?.canRedeem||pending)return;
    setPending(true);setNotice('');
    const form=new FormData();form.set('brandId',brandId);form.set('locationId',locationId);form.set('voucherId',selected.id);form.set('amount',amount);
    try{const result=await redeemMerchantGameCode(form);setNotice(result.message);if(result.ok){setSelected(null);setAmount('');router.refresh();}}
    catch{setNotice('Indløsning kunne ikke gennemføres. Prøv igen.');}
    finally{setPending(false);}
  }
  return <div className="mx-auto max-w-6xl space-y-6 text-slate-900">
    <header><p className="text-sm font-medium text-slate-500">Restaurantens spil</p><h1 className="text-2xl font-bold">Indløs kode</h1></header>
    <section className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Brand<select value={brandId} onChange={event=>switchScope(event.target.value)} className="h-11 rounded-lg border bg-white px-3">{brands.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">Restaurant<select value={locationId} onChange={event=>switchScope(brandId,event.target.value)} className="h-11 rounded-lg border bg-white px-3">{locations.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></section>
    {!locations.length&&<p className="rounded-lg bg-amber-50 p-4 text-sm">Du har ikke adgang til en aktiv restaurant for dette brand.</p>}
    {current&&!current.canRedeem&&<p className="rounded-lg bg-amber-50 p-4 text-sm">Din konto kan se koderne, men mangler rettigheden til at indløse dem på denne restaurant.</p>}
    {notice&&<p role="status" className="rounded-lg border bg-white p-4 text-sm">{notice}</p>}
    <section className="rounded-xl border bg-white p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Gevinster</h2><p className="text-sm text-slate-500">{visible.length} af {rows.length} koder · Én indløsning pr. kode</p></div><input aria-label="Søg på kode, navn, e-mail eller telefon" placeholder="Søg kode, navn, e-mail eller tlf." value={search} onChange={event=>setSearch(event.target.value)} className="h-11 w-full rounded-lg border px-3 text-sm sm:max-w-sm"/></div>
      <div className="mt-4 space-y-3 md:hidden">{visible.map(row=><article key={row.id} className="rounded-lg border p-4"><div className="flex justify-between gap-2"><div><p className="font-semibold">{row.name}</p><p className="text-xs text-slate-500">{date(row.date)}</p></div><span className="text-xs font-medium">{row.status}</span></div><p className="mt-3 break-all font-mono text-sm">{row.code}</p><p className="mt-1 text-sm">Gevinst: {row.prize}</p>{row.redeemable&&current?.canRedeem&&<button onClick={()=>{setSelected(row);setNotice('');}} className="mt-3 w-full rounded-lg bg-sky-700 px-4 py-2.5 font-medium text-white">Indløs</button>}</article>)}</div>
      <div className="mt-4 hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50"><tr><th className="p-3">Dato</th><th className="p-3">Kunde</th><th className="p-3">Kode</th><th className="p-3">Gevinst</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Handling</span></th></tr></thead><tbody>{visible.map(row=><tr key={row.id} className="border-b last:border-0"><td className="whitespace-nowrap p-3">{date(row.date)}</td><td className="p-3 font-medium">{row.name}</td><td className="p-3 font-mono">{row.code}</td><td className="p-3">{row.prize}</td><td className="p-3">{row.status}</td><td className="p-3 text-right">{row.redeemable&&current?.canRedeem&&<button onClick={()=>{setSelected(row);setNotice('');}} className="rounded-lg bg-sky-700 px-4 py-2 font-medium text-white">Indløs</button>}</td></tr>)}</tbody></table></div>
      {!visible.length&&<p className="py-10 text-center text-sm text-slate-500">Ingen koder matcher søgningen.</p>}
    </section>
    {selected&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="redeem-title" className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><h2 id="redeem-title" className="text-lg font-semibold">Indløs {selected.prize}</h2><p className="mt-2 text-sm">{selected.name} · <span className="font-mono">{selected.code}</span></p><p className="mt-2 text-sm text-slate-600">Koden bliver ugyldig både her og online, når du bekræfter.</p><label className="mt-4 grid gap-1 text-sm font-medium">Samlet købsbeløb inkl. moms (kr.)<input autoFocus required type="number" min="0" max="999999.99" step="0.01" value={amount} onChange={event=>setAmount(event.target.value)} placeholder="0,00" className="h-11 rounded-lg border px-3"/></label><p className="mt-1 text-xs text-slate-500">Skriv 0, hvis gæsten kun indløser præmien uden et køb.</p><div className="mt-5 flex justify-end gap-2"><button disabled={pending} onClick={()=>{setSelected(null);setAmount('');}} className="rounded-lg border px-4 py-2">Annuller</button><button disabled={pending||!amount} onClick={redeem} className="rounded-lg bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50">{pending?'Indløser…':'Bekræft indløsning'}</button></div></div></div>}
  </div>;
}
