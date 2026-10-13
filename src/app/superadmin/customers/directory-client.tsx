'use client';

import { useMemo, useState } from 'react';
import Link from '@/components/superadmin/admin-link';
import type { DirectoryEntry } from '@/lib/customers/directory';
import { matchesCustomerSearch, matchesCustomerType, matchesDateRange, type CustomerTypeFilter } from '@/lib/customers/filtering';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { CustomerForm } from '@/components/superadmin/customer-form';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

export function CustomersDirectory({entries,brandNames,global}:{entries:DirectoryEntry[];brandNames:Record<string,string>;global:boolean}) {
  const [search,setSearch]=useState('');
  const [brand,setBrand]=useState('all');
  const [customerType,setCustomerType]=useState<CustomerTypeFilter>('all');
  const [loyalty,setLoyalty]=useState('all');
  const [createdFrom,setCreatedFrom]=useState('');
  const [createdTo,setCreatedTo]=useState('');
  const [formOpen,setFormOpen]=useState(false);
  const router=useRouter();

  const rows=useMemo(()=>entries.filter(entry=>{
    const brandSources=entry.sources.filter(source=>brand==='all'||source.brandId===brand);
    const dateSources=brandSources.filter(source=>matchesDateRange(source.date,createdFrom,createdTo));
    if(!brandSources.length||!dateSources.length)return false;
    if(!matchesCustomerSearch(search,[entry.name,entry.email,entry.phone,...brandSources.flatMap(source=>[source.name,source.phone])]))return false;
    if(!matchesCustomerType(customerType,brandSources))return false;
    if(loyalty!=='all'&&!dateSources.some(source=>source.kind==='customer'&&source.loyaltyClassification===loyalty))return false;
    return true;
  }),[entries,search,brand,customerType,loyalty,createdFrom,createdTo]);

  const clearFilters=()=>{
    setSearch('');
    setBrand('all');
    setCustomerType('all');
    setLoyalty('all');
    setCreatedFrom('');
    setCreatedTo('');
  };
  const isFiltered=search!==''||brand!=='all'||customerType!=='all'||loyalty!=='all'||createdFrom!==''||createdTo!=='';
  const invalidDateRange=!!createdFrom&&!!createdTo&&createdFrom>createdTo;

  return <main className="space-y-5 p-4 sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Kunder</h1><p className="text-sm text-muted-foreground">{global?'Samlet overblik på tværs af brands.':'Kun kunder og aktiviteter fra dine brands.'} Spildeltagere vises også uden køb.</p></div>
      <Button onClick={()=>setFormOpen(true)}>Opret kunde</Button>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Input aria-label="Søg kunder" placeholder="Søg navn, e-mail eller telefon" value={search} onChange={event=>setSearch(event.target.value)} className="xl:col-span-2"/>
      <Select value={brand} onValueChange={setBrand}>
        <SelectTrigger aria-label="Filtrer brand"><SelectValue placeholder="Alle brands"/></SelectTrigger>
        <SelectContent><SelectItem value="all">Alle brands</SelectItem>{Object.entries(brandNames).map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={customerType} onValueChange={value=>setCustomerType(value as CustomerTypeFilter)}>
        <SelectTrigger aria-label="Filtrer kundetype"><SelectValue placeholder="Alle kundetyper"/></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle kundetyper</SelectItem>
          <SelectItem value="no-orders">Ingen køb endnu</SelectItem>
          <SelectItem value="first-order">Første køb (1 betalt ordre)</SelectItem>
          <SelectItem value="returning">Tilbagevendende (2+ betalte køb)</SelectItem>
          <SelectItem value="game-only">Kun Games-tilmelding</SelectItem>
        </SelectContent>
      </Select>
      <Select value={loyalty} onValueChange={setLoyalty}>
        <SelectTrigger aria-label="Filtrer loyalitet"><SelectValue placeholder="Alle loyalitetsniveauer"/></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle loyalitetsniveauer</SelectItem>
          <SelectItem value="Loyal">Loyal</SelectItem>
          <SelectItem value="Occasional">Occasional</SelectItem>
          <SelectItem value="At Risk">At risk</SelectItem>
          <SelectItem value="New">New</SelectItem>
        </SelectContent>
      </Select>
      <div className="grid grid-cols-2 gap-2 xl:col-span-2">
        <div className="space-y-1"><label htmlFor="directory-created-from" className="text-xs text-muted-foreground">Oprettet fra</label><Input id="directory-created-from" aria-label="Oprettet fra" type="date" value={createdFrom} onChange={event=>setCreatedFrom(event.target.value)}/></div>
        <div className="space-y-1"><label htmlFor="directory-created-to" className="text-xs text-muted-foreground">Oprettet til</label><Input id="directory-created-to" aria-label="Oprettet til" type="date" value={createdTo} onChange={event=>setCreatedTo(event.target.value)}/></div>
      </div>
      {isFiltered&&<Button variant="ghost" onClick={clearFilters} className="justify-start" aria-label="Nulstil filtre"><X className="mr-2 h-4 w-4"/>Nulstil filtre</Button>}
    </div>

    {invalidDateRange&&<p role="alert" className="text-sm text-destructive">Datoen “fra” skal ligge før eller på datoen “til”.</p>}
    <p className="text-sm text-muted-foreground">{rows.length.toLocaleString('da-DK')} kunder</p>
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b bg-muted/40"><tr><th className="p-3">Kunde</th><th className="p-3">Brand</th><th className="p-3">Kundetype</th><th className="p-3">Loyalitet</th><th className="p-3">Oprettet</th><th className="p-3 text-right">Køb</th><th className="p-3 text-right">Omsætning</th><th className="p-3 text-right">Spil</th></tr></thead>
        <tbody>{rows.map(entry=>{
          const sources=entry.sources.filter(source=>brand==='all'||source.brandId===brand);
          const customerSources=sources.filter(source=>source.kind==='customer');
          const games=sources.filter(source=>source.kind==='game');
          const brands=[...new Set(sources.map(source=>source.brandId))];
          const dates=sources.map(source=>source.date).filter((value):value is string=>!!value&&matchesDateRange(value,createdFrom,createdTo)).sort();
          const orders=sources.reduce((total,source)=>total+(source.kind==='customer'?source.totalOrders||0:source.externalOrders||0),0);
          const spend=sources.reduce((total,source)=>total+(source.kind==='customer'?source.totalSpend||0:source.externalSpend||0),0);
          const loyaltyLabels=[...new Set(customerSources.filter(source=>source.loyaltyClassification).map(source=>source.loyaltyClassification))];
          const typeLabel=customerSources.length
            ? (matchesCustomerType('returning',customerSources)?'Tilbagevendende kunde':matchesCustomerType('first-order',customerSources)?'Førstegangskøber':matchesCustomerType('no-orders',customerSources)?'Ingen køb endnu':'Orderfly-kunde')+(games.length?' + Games':'')
            : 'Games uden Orderfly-profil';
          return <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30">
            <td className="p-3"><Link href={'/superadmin/customers/directory/'+entry.id} className="font-medium underline-offset-2 hover:underline">{entry.name}</Link><div className="break-all text-muted-foreground">{entry.email}</div></td>
            <td className="p-3">{brands.map(id=>brandNames[id]||id).join(', ')}</td>
            <td className="p-3">{typeLabel}</td>
            <td className="p-3">{loyaltyLabels.length?loyaltyLabels.join(', '):'—'}</td>
            <td className="p-3">{dates[0]?new Date(dates[0]).toLocaleDateString('da-DK'):'—'}</td>
            <td className="p-3 text-right tabular-nums">{orders}</td>
            <td className="p-3 text-right tabular-nums">{spend.toLocaleString('da-DK',{style:'currency',currency:'DKK'})}</td>
            <td className="p-3 text-right tabular-nums">{games.length}</td>
          </tr>;
        })}{!rows.length&&<tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Ingen kunder matcher filtrene.</td></tr>}</tbody>
      </table>
    </div>
    <CustomerForm isOpen={formOpen} setIsOpen={open=>{setFormOpen(open);if(!open)router.refresh();}} customer={null}/>
  </main>;
}
