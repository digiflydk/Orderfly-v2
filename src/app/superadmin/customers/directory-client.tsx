'use client';

import { useMemo, useState } from 'react';
import Link from '@/components/superadmin/admin-link';
import type { DirectoryEntry } from '@/lib/customers/directory';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { CustomerForm } from '@/components/superadmin/customer-form';
import { useRouter } from 'next/navigation';

export function CustomersDirectory({entries,brandNames,global}:{entries:DirectoryEntry[];brandNames:Record<string,string>;global:boolean}) {
  const [search,setSearch]=useState(''),[brand,setBrand]=useState('all');
  const [formOpen,setFormOpen]=useState(false),router=useRouter();
  const rows=useMemo(()=>entries.filter(entry=>(brand==='all'||entry.brandIds.includes(brand))&&(!search||[entry.name,entry.email,entry.phone].some(value=>value.toLowerCase().includes(search.toLowerCase())))),[entries,search,brand]);
  return <main className="space-y-5 p-4 sm:p-6">
    <div className="flex items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Kunder</h1><p className="text-sm text-muted-foreground">{global?'Samlet overblik på tværs af merchants.':'Kun kunder og aktiviteter fra dine merchants.'} Spildeltagere vises også uden køb.</p></div><Button onClick={()=>setFormOpen(true)}>Opret kunde</Button></div>
    <div className="flex flex-col gap-3 sm:flex-row"><Input aria-label="Søg kunder" placeholder="Søg efter navn, e-mail eller telefon" value={search} onChange={event=>setSearch(event.target.value)} className="sm:max-w-md"/><Select value={brand} onValueChange={setBrand}><SelectTrigger aria-label="Filtrer merchant" className="sm:w-60"><SelectValue placeholder="Alle merchants"/></SelectTrigger><SelectContent><SelectItem value="all">Alle merchants</SelectItem>{Object.entries(brandNames).map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>
    <p className="text-sm text-muted-foreground">{rows.length.toLocaleString('da-DK')} kunder</p>
    <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b bg-muted/40"><tr><th className="p-3">Kunde</th><th className="p-3">Merchants</th><th className="p-3 text-right">Køb</th><th className="p-3 text-right">Omsætning</th><th className="p-3 text-right">Spil</th></tr></thead><tbody>{rows.map(entry=><tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30"><td className="p-3"><Link href={`/superadmin/customers/directory/${entry.id}`} className="font-medium underline-offset-2 hover:underline">{entry.name}</Link><div className="break-all text-muted-foreground">{entry.email}</div></td><td className="p-3">{entry.brandIds.map(id=>brandNames[id]||id).join(', ')}</td><td className="p-3 text-right tabular-nums">{entry.totalOrders}</td><td className="p-3 text-right tabular-nums">{entry.totalSpend.toLocaleString('da-DK',{style:'currency',currency:'DKK'})}</td><td className="p-3 text-right tabular-nums">{entry.gameCount}</td></tr>)}{!rows.length&&<tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Ingen kunder matcher filtrene.</td></tr>}</tbody></table></div>
    <CustomerForm isOpen={formOpen} setIsOpen={open=>{setFormOpen(open);if(!open)router.refresh();}} customer={null}/>
  </main>;
}
