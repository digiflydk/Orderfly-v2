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
    if(!matchesCustomerSearch(search,[entry.name,...entry.emails,...entry.phones,...brandSources.flatMap(source=>[source.name,...source.emails,...source.phones])]))return false;
    if(!matchesCustomerType(customerType,dateSources))return false;
    if(loyalty!=='all'&&!dateSources.some(source=>source.kind==='customer'&&source.loyaltyClassification===loyalty))return false;
    return true;
  }),[entries,search,brand,customerType,loyalty,createdFrom,createdTo]);

  const bookingCount=rows.filter(entry=>entry.sources.some(source=>(brand==='all'||source.brandId===brand)&&source.kind==='customer'&&source.hasBookingSource)).length;
  const omnisendCount=rows.filter(entry=>entry.sources.some(source=>(brand==='all'||source.brandId===brand)&&source.kind==='customer'&&source.hasOmnisendSource)).length;

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

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="space-y-1 xl:col-span-2"><label htmlFor="directory-search" className="text-xs font-medium text-muted-foreground">Søg kunder</label><Input id="directory-search" aria-label="Søg kunder" placeholder="Navn, e-mail eller telefon" value={search} onChange={event=>setSearch(event.target.value)}/></div>
      <div className="space-y-1"><label id="directory-brand-label" className="text-xs font-medium text-muted-foreground">Brand</label>
      <Select value={brand} onValueChange={setBrand}>
        <SelectTrigger aria-label="Filtrer brand" aria-labelledby="directory-brand-label"><SelectValue placeholder="Alle brands"/></SelectTrigger>
        <SelectContent><SelectItem value="all">Alle brands</SelectItem>{Object.entries(brandNames).map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
      </Select></div>
      <div className="space-y-1"><label id="directory-type-label" className="text-xs font-medium text-muted-foreground">Kundetype</label>
      <Select value={customerType} onValueChange={value=>setCustomerType(value as CustomerTypeFilter)}>
        <SelectTrigger aria-label="Filtrer kundetype" aria-labelledby="directory-type-label"><SelectValue placeholder="Alle kundetyper"/></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle kundetyper</SelectItem>
          <SelectItem value="no-orders">Ingen køb endnu</SelectItem>
          <SelectItem value="first-order">Første køb (1 betalt ordre)</SelectItem>
          <SelectItem value="returning">Tilbagevendende (2+ betalte køb)</SelectItem>
          <SelectItem value="booking">Bordbooking gæst</SelectItem>
          <SelectItem value="omnisend">Omnisend-kontakt</SelectItem>
          <SelectItem value="game-only">Kun Games-tilmelding</SelectItem>
        </SelectContent>
      </Select></div>
      <div className="space-y-1"><label id="directory-loyalty-label" className="text-xs font-medium text-muted-foreground">Loyalitet</label>
      <Select value={loyalty} onValueChange={setLoyalty}>
        <SelectTrigger aria-label="Filtrer loyalitet" aria-labelledby="directory-loyalty-label"><SelectValue placeholder="Alle loyalitetsniveauer"/></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle loyalitetsniveauer</SelectItem>
          <SelectItem value="Loyal">Loyal</SelectItem>
          <SelectItem value="Occasional">Occasional</SelectItem>
          <SelectItem value="At Risk">At risk</SelectItem>
          <SelectItem value="New">New</SelectItem>
        </SelectContent>
      </Select></div>
      <div className="space-y-1"><label htmlFor="directory-created-from" className="text-xs font-medium text-muted-foreground">Oprettet fra</label><Input id="directory-created-from" aria-label="Oprettet fra" type="date" value={createdFrom} onChange={event=>setCreatedFrom(event.target.value)}/></div>
      <div className="space-y-1"><label htmlFor="directory-created-to" className="text-xs font-medium text-muted-foreground">Oprettet til</label><Input id="directory-created-to" aria-label="Oprettet til" type="date" value={createdTo} onChange={event=>setCreatedTo(event.target.value)}/></div>
      {isFiltered&&<Button variant="ghost" onClick={clearFilters} className="justify-start" aria-label="Nulstil filtre"><X className="mr-2 h-4 w-4"/>Nulstil filtre</Button>}
    </div>

    {invalidDateRange&&<p role="alert" className="text-sm text-destructive">Datoen “fra” skal ligge før eller på datoen “til”.</p>}
    <p className="text-sm text-muted-foreground">{rows.length.toLocaleString('da-DK')} kunder · {bookingCount.toLocaleString('da-DK')} bordbookingprofiler · {omnisendCount.toLocaleString('da-DK')} Omnisend-kontakter</p>
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead className="border-b bg-muted/40"><tr><th className="p-3">Kunde</th><th className="p-3">Brand</th><th className="p-3">Kundetype</th><th className="p-3">Kilder</th><th className="p-3">Loyalitet</th><th className="p-3">Oprettet</th><th className="p-3 text-right">Køb</th><th className="p-3 text-right">Omsætning</th><th className="p-3 text-right">Spil</th></tr></thead>
        <tbody>{rows.map(entry=>{
          const sources=entry.sources.filter(source=>brand==='all'||source.brandId===brand);
          const customerSources=sources.filter(source=>source.kind==='customer');
          const games=sources.filter(source=>source.kind==='game');
          const brands=[...new Set(sources.map(source=>source.brandId))];
          const dates=sources.map(source=>source.date).filter((value):value is string=>!!value&&matchesDateRange(value,createdFrom,createdTo)).sort();
          const orders=sources.reduce((total,source)=>total+(source.kind==='customer'?source.totalOrders||0:source.externalOrders||0),0);
          const spend=sources.reduce((total,source)=>total+(source.kind==='customer'?source.totalSpend||0:source.externalSpend||0),0);
          const loyaltyLabels=[...new Set(customerSources.filter(source=>source.loyaltyClassification).map(source=>source.loyaltyClassification))];
          const sourceLabels=[
            ...(customerSources.some(source=>source.hasBookingSource)?['Bordbooking']:[]),
            ...(customerSources.some(source=>source.hasOmnisendSource)?['Omnisend']:[]),
            ...(customerSources.length&&!customerSources.some(source=>source.hasBookingSource||source.hasOmnisendSource)?['Orderfly']:[]),
            ...(games.length?['Games']:[]),
          ];
          const typeLabel=customerSources.length
            ? (matchesCustomerType('returning',customerSources)?'Tilbagevendende kunde':matchesCustomerType('first-order',customerSources)?'Førstegangskøber':matchesCustomerType('no-orders',customerSources)?'Ingen køb endnu':'Orderfly-kunde')+(games.length?' + Games':'')
            : 'Games uden Orderfly-profil';
          return <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30">
            <td className="p-3"><Link href={'/superadmin/customers/directory/'+entry.id} className="font-medium underline-offset-2 hover:underline">{entry.name}</Link><div className="break-all text-muted-foreground">{entry.email||entry.phone}</div>{entry.emails.length+entry.phones.length>2&&<div className="text-xs text-muted-foreground">{entry.emails.length+entry.phones.length-2} ekstra kontaktoplysninger</div>}</td>
            <td className="p-3">{brands.map(id=>brandNames[id]||id).join(', ')}</td>
            <td className="p-3">{typeLabel}</td>
            <td className="p-3"><div className="flex flex-wrap gap-1">{sourceLabels.map(label=><span key={label} className="rounded-full border px-2 py-0.5 text-xs">{label}</span>)}</div></td>
            <td className="p-3">{loyaltyLabels.length?loyaltyLabels.join(', '):'—'}</td>
            <td className="p-3">{dates[0]?new Date(dates[0]).toLocaleDateString('da-DK'):'—'}</td>
            <td className="p-3 text-right tabular-nums">{orders}</td>
            <td className="p-3 text-right tabular-nums">{spend.toLocaleString('da-DK',{style:'currency',currency:'DKK'})}</td>
            <td className="p-3 text-right tabular-nums">{games.length}</td>
          </tr>;
        })}{!rows.length&&<tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Ingen kunder matcher filtrene.</td></tr>}</tbody>
      </table>
    </div>
    <CustomerForm isOpen={formOpen} setIsOpen={open=>{setFormOpen(open);if(!open)router.refresh();}} customer={null}/>
  </main>;
}
