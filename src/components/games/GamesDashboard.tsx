'use client';

import { useState } from 'react';
import Link from '@/components/superadmin/admin-link';
import { Archive, ArrowRight, CalendarDays, Search, Ticket, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CreateCampaignButton } from './CreateCampaignButton';

type Status = 'live' | 'scheduled' | 'paused' | 'test' | 'draft' | 'ended';
export type GameCampaignRow = { id:string;brandId:string;brandName:string;name:string;status:Status;startsAt:string|null;endsAt:string|null;participants:number;limit:number };
type Filter = 'all' | 'live' | 'scheduled' | 'draft' | 'ended';
const filters:{value:Filter;label:string}[]=[{value:'all',label:'Alle'},{value:'live',label:'Aktive'},{value:'scheduled',label:'Planlagte'},{value:'draft',label:'Kladder'},{value:'ended',label:'Afsluttede'}];
const labels:Record<Status,string>={live:'Aktiv',scheduled:'Planlagt',paused:'Pauset',test:'I test',draft:'Kladde',ended:'Afsluttet'};
const tones:Record<Status,string>={live:'bg-emerald-50 text-emerald-800 ring-emerald-200',scheduled:'bg-blue-50 text-blue-800 ring-blue-200',paused:'bg-amber-50 text-amber-800 ring-amber-200',test:'bg-violet-50 text-violet-800 ring-violet-200',draft:'bg-slate-100 text-slate-700 ring-slate-200',ended:'bg-slate-100 text-slate-600 ring-slate-200'};
const priority:Record<Status,number>={live:0,scheduled:1,paused:2,test:3,draft:4,ended:5};
const date=(value:string|null)=>value?new Intl.DateTimeFormat('da-DK',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Copenhagen'}).format(new Date(value)):null;

export function GamesDashboard({campaigns,brands}:{campaigns:GameCampaignRow[];brands:{id:string;name:string;hasBase:boolean}[]}){
  const [filter,setFilter]=useState<Filter>('all'),[search,setSearch]=useState(''),[brand,setBrand]=useState('all');
  const active=campaigns.filter(row=>row.status==='live').length,scheduled=campaigns.filter(row=>row.status==='scheduled').length,ended=campaigns.filter(row=>row.status==='ended').length;
  const counts:Record<Filter,number>={all:campaigns.length,live:active,scheduled,draft:campaigns.filter(row=>['draft','test','paused'].includes(row.status)).length,ended};
  const rows=campaigns.filter(row=>{
    const term=search.trim().toLocaleLowerCase('da-DK');
    return (filter==='all'||row.status===filter||(filter==='draft'&&['test','paused'].includes(row.status)))&&(brand==='all'||row.brandId===brand)&&(!term||`${row.name} ${row.brandName}`.toLocaleLowerCase('da-DK').includes(term));
  }).sort((a,b)=>priority[a.status]-priority[b.status]||(b.startsAt||'').localeCompare(a.startsAt||'')||a.name.localeCompare(b.name,'da'));
  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Promotions</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Games</h1><p className="mt-1 text-sm text-muted-foreground">Planlæg skrabelodder, følg deltagere og se resultater for hvert spil.</p></div>{brands.length===1&&<CreateCampaignButton brandId={brands[0].id} brandName={brands[0].name} hasBase={brands[0].hasBase} compact/>}</header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Kampagneoverblik">{([
      {label:'Aktive spil',value:active,icon:Ticket},{label:'Planlagte spil',value:scheduled,icon:CalendarDays},
      {label:'Deltagere i alt',value:campaigns.reduce((sum,row)=>sum+row.participants,0),icon:Users},{label:'Afsluttede spil',value:ended,icon:Archive},
    ] as const).map(item=><Card key={item.label}><CardContent className="flex items-start justify-between p-4 sm:p-5"><div><p className="text-xs font-medium text-muted-foreground sm:text-sm">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{item.value.toLocaleString('da-DK')}</p></div><item.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true"/></CardContent></Card>)}</div>
    <Card><CardContent className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">Kampagner</h2><p className="text-sm text-muted-foreground">Vælg et spil for at ændre opsætning eller se deltagerne.</p></div><span className="text-sm text-muted-foreground">{rows.length} vist</span></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrér kampagner efter status">{filters.map(item=><Button key={item.value} type="button" size="sm" variant={filter===item.value?'default':'outline'} onClick={()=>setFilter(item.value)} aria-pressed={filter===item.value}>{item.label} <span className="ml-1 tabular-nums opacity-70">{counts[item.value]}</span></Button>)}</div>
      <div className="flex flex-col gap-3 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/><Input aria-label="Søg efter spil eller brand" className="pl-9" placeholder="Søg efter spil eller brand" value={search} onChange={event=>setSearch(event.target.value)}/></div>{brands.length>1&&<select aria-label="Filtrér efter brand" className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:w-52" value={brand} onChange={event=>setBrand(event.target.value)}><option value="all">Alle brands</option>{brands.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}</div>
      {rows.length?<div className="divide-y rounded-lg border" role="list">{rows.map(row=>{
        const campaign=encodeURIComponent(row.id),brandId=encodeURIComponent(row.brandId);
        return <article key={row.id} role="listitem" className="flex flex-col gap-4 p-4 transition-colors hover:bg-muted/30 sm:p-5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{row.name}</h3><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[row.status]}`}>{labels[row.status]}</span></div><p className="mt-1 text-sm text-muted-foreground">{row.brandName} · Skrabelod</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden="true"/>{date(row.startsAt)||(row.status==='live'?'Startet uden dato':'Start ikke sat')} → {date(row.endsAt)||'Ingen slutdato'}</span><span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true"/>{row.participants.toLocaleString('da-DK')} / {row.limit.toLocaleString('da-DK')} deltagere</span></div></div><div className="flex shrink-0 flex-wrap gap-2"><Button size="sm" variant="outline" asChild><Link href={`/superadmin/games/participants?brand=${brandId}&campaign=${campaign}`}>Deltagere</Link></Button><Button size="sm" asChild><Link href={`/superadmin/games/scratch-card?brand=${brandId}&campaign=${campaign}`}>Åbn spil <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true"/></Link></Button></div></article>;
      })}</div>:<div className="rounded-lg border border-dashed px-6 py-12 text-center"><p className="font-medium">Ingen spil matcher dit valg</p><p className="mt-1 text-sm text-muted-foreground">Prøv en anden status, et andet brand eller en ny søgning.</p>{(filter!=='all'||search||brand!=='all')&&<Button className="mt-4" variant="outline" onClick={()=>{setFilter('all');setSearch('');setBrand('all');}}>Ryd filtre</Button>}</div>}
    </CardContent></Card>
    {brands.length>1&&<Card><CardContent className="space-y-3 p-4 sm:p-6"><h2 className="text-lg font-semibold">Opret nyt spil</h2><p className="text-sm text-muted-foreground">Vælg det brand, spillet skal høre til.</p><div className="flex flex-wrap gap-2">{brands.map(item=><CreateCampaignButton key={item.id} brandId={item.id} brandName={item.name} hasBase={item.hasBase}/>)}</div></CardContent></Card>}
    {!brands.length&&<p className="text-sm text-muted-foreground">Du har ikke adgang til et brand med website-rettigheder.</p>}
  </main>;
}
