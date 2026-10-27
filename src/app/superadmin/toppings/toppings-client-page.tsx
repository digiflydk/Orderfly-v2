'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Topping, ToppingGroup, Location, Brand } from '@/types';
import { duplicateTopping, duplicateToppingGroup } from './actions';

type Group = ToppingGroup & { displayName?: string; kind?: 'addition' | 'removal'; selectionMode?: 'single' | 'multiple' };
type Option = Topping & { maxQuantity?: number; productId?: string };
export type ToppingUsage = Record<string, { products: { id: string; name: string }[]; count: number }>;
interface Props {
  initialToppingGroups: Group[]; initialToppings: Option[]; initialLocations: Location[]; initialBrands: Brand[];
  initialUsage?: ToppingUsage;
}
const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
const currency = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' });
export function ToppingsClientPage({ initialToppingGroups, initialToppings, initialLocations, initialBrands, initialUsage = {} }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState('groups');
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('all');
  const [location, setLocation] = useState('all');
  const [group, setGroup] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  useEffect(() => setPage(1), [tab, query, brand, location, group, status, pageSize]);
  const groupMap = useMemo(() => new Map(initialToppingGroups.map(g => [g.id, g])), [initialToppingGroups]);
  const locations = initialLocations.filter(l => brand === 'all' || l.brandId === brand);
  const scoped = (ids: string[]) => (location === 'all' || ids.includes(location)) && (brand === 'all' || locations.some(l => ids.includes(l.id)));
  const search = query.trim().toLocaleLowerCase('da-DK');
  const groups = initialToppingGroups.filter(g => scoped(g.locationIds) && `${g.groupName} ${g.displayName || ''}`.toLocaleLowerCase('da-DK').includes(search)).sort((a, b) => a.groupName.localeCompare(b.groupName, 'da'));
  const options = initialToppings.filter(t => scoped(t.locationIds) && (group === 'all' || t.groupId === group) && (status === 'all' || (status === 'active') === t.isActive) && `${t.toppingName} ${groupMap.get(t.groupId)?.groupName || ''}`.toLocaleLowerCase('da-DK').includes(search)).sort((a, b) => a.toppingName.localeCompare(b.toppingName, 'da'));
  const count = tab === 'groups' ? groups.length : options.length;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * pageSize;
  const locationNames = (ids: string[]) => initialLocations.filter(l => ids.includes(l.id)).map(l => l.name).join(', ') || 'Ingen lokationer';
  const copy = (id: string, isGroup: boolean) => startTransition(async () => {
    setMessage('');
    try {
      const result = await (isGroup ? duplicateToppingGroup(id) : duplicateTopping(id));
      if (result.error || !result.id) { setMessage(result.message); return; }
      router.push(`/superadmin/toppings/${isGroup ? 'edit-group' : 'edit-topping'}/${result.id}`);
      router.refresh();
    } catch { setMessage('Kopieringen kunne ikke gennemføres. Prøv igen.'); }
  });
  return <div className="space-y-5">
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background py-4">
      <div><h1 className="text-2xl font-bold">Tilvalg og tilvalgsgrupper</h1><p className="text-sm text-muted-foreground">Find, organisér og rediger dine tilvalg.</p></div>
      <Button asChild><Link href={`/superadmin/toppings/${tab === 'groups' ? 'new-group' : 'new-topping'}`}>{tab === 'groups' ? 'Opret tilvalgsgruppe' : 'Opret tilvalg'}</Link></Button>
    </header>
    <Tabs value={tab} onValueChange={setTab}><TabsList aria-label="Katalogvisning"><TabsTrigger value="groups">Tilvalgsgrupper ({initialToppingGroups.length})</TabsTrigger><TabsTrigger value="options">Tilvalg ({initialToppings.length})</TabsTrigger></TabsList></Tabs>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <label className="space-y-1 text-sm">Søg<Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Søg efter navn eller gruppe" /></label>
      <label className="space-y-1 text-sm">Brand<select aria-label="Brand" className={selectClass} value={brand} onChange={e => { setBrand(e.target.value); setLocation('all'); setGroup('all'); }}><option value="all">Alle brands</option>{[...initialBrands].sort((a,b) => a.name.localeCompare(b.name,'da')).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="space-y-1 text-sm">Lokation<select aria-label="Lokation" className={selectClass} value={location} onChange={e => { setLocation(e.target.value); setGroup('all'); }}><option value="all">Alle lokationer</option>{[...locations].sort((a,b) => a.name.localeCompare(b.name,'da')).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      {tab === 'options' && <><label className="space-y-1 text-sm">Tilvalgsgruppe<select aria-label="Tilvalgsgruppe" className={selectClass} value={group} onChange={e => setGroup(e.target.value)}><option value="all">Alle tilvalgsgrupper</option>{[...initialToppingGroups].filter(g => scoped(g.locationIds)).sort((a,b) => a.groupName.localeCompare(b.groupName,'da')).map(g => <option key={g.id} value={g.id}>{g.groupName}</option>)}</select></label><label className="space-y-1 text-sm">Status<select aria-label="Status" className={selectClass} value={status} onChange={e => setStatus(e.target.value)}><option value="all">Alle</option><option value="active">Aktive</option><option value="inactive">Inaktive</option></select></label></>}
    </div>
    <div className="flex items-center justify-between gap-3 text-sm"><p aria-live="polite">{count} {tab === 'groups' ? 'tilvalgsgrupper' : 'tilvalg'}</p><Button variant="ghost" onClick={() => { setQuery(''); setBrand('all'); setLocation('all'); setGroup('all'); setStatus('all'); }}>Nulstil filtre</Button></div>
    {message && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{message}</p>}
    <p className="text-xs text-muted-foreground md:hidden">Rul tabellen sidelæns for at se alle kolonner.</p>
    <div className="overflow-x-auto rounded-md border">
      <Table><TableHeader><TableRow>{(tab === 'groups' ? ['Internt navn', 'Visningsnavn', 'Type', 'Antal tilvalg', 'Valgregler', 'Bruges på', 'Lokationer', 'Handlinger'] : ['Navn', 'Tilvalgsgruppe', 'Pris', 'Maks. antal', 'Standard', 'Status', 'Lokationer', 'Handlinger']).map(h => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{tab === 'groups' ? groups.slice(start, start + pageSize).map(g => <TableRow key={g.id}>
          <TableCell><Link className="font-medium underline-offset-4 hover:underline" href={`/superadmin/toppings/edit-group/${g.id}`}>{g.groupName}</Link></TableCell><TableCell>{g.displayName || g.groupName}</TableCell><TableCell>{g.kind === 'removal' ? 'Fravalg' : 'Tilvalg'}</TableCell><TableCell>{initialToppings.filter(t => t.groupId === g.id).length}</TableCell><TableCell className="whitespace-nowrap">{g.minSelection}–{g.maxSelection || 'ubegrænset'}{g.selectionMode === 'single' ? ' · én type' : ''}</TableCell><TableCell>{initialUsage[g.id]?.count ?? 0} {(initialUsage[g.id]?.count ?? 0) === 1 ? 'produkt' : 'produkter'}</TableCell><TableCell className="max-w-60 break-words">{locationNames(g.locationIds)}</TableCell><TableCell><div className="flex gap-2"><Button asChild size="sm" variant="outline"><Link href={`/superadmin/toppings/edit-group/${g.id}`}>Åbn</Link></Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => copy(g.id, true)} aria-label={`Kopiér ${g.groupName}`}>Kopiér</Button></div></TableCell>
        </TableRow>) : options.slice(start, start + pageSize).map(t => <TableRow key={t.id}>
          <TableCell><Link className="font-medium underline-offset-4 hover:underline" href={`/superadmin/toppings/edit-topping/${t.id}`}>{t.toppingName}</Link>{t.productId && <span className="block text-xs text-muted-foreground">Tilknyttet produkt</span>}</TableCell><TableCell>{groupMap.get(t.groupId)?.groupName || 'Gruppen findes ikke'}</TableCell><TableCell className="whitespace-nowrap">{t.productId ? 'Produktpris' : currency.format(t.price)}</TableCell><TableCell>{t.maxQuantity ?? 1}</TableCell><TableCell>{t.isDefault ? 'Ja' : 'Nej'}</TableCell><TableCell><Badge variant={t.isActive ? 'default' : 'secondary'}>{t.isActive ? 'Aktiv' : 'Inaktiv'}</Badge></TableCell><TableCell className="max-w-60 break-words">{locationNames(t.locationIds)}</TableCell><TableCell><div className="flex gap-2"><Button asChild size="sm" variant="outline"><Link href={`/superadmin/toppings/edit-topping/${t.id}`}>Åbn</Link></Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => copy(t.id, false)} aria-label={`Kopiér ${t.toppingName}`}>Kopiér</Button></div></TableCell>
        </TableRow>)}{count === 0 && <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">Ingen resultater. Prøv at ændre dine filtre.</TableCell></TableRow>}</TableBody>
      </Table>
    </div>
    <nav aria-label="Sideinddeling" className="flex flex-wrap items-center justify-between gap-3 text-sm"><label>Rækker pr. side <select aria-label="Rækker pr. side" className="ml-2 rounded border p-2" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>{[25,50,100].map(n => <option key={n} value={n}>{n}</option>)}</select></label><div className="flex items-center gap-3"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Forrige</Button><span>Side {currentPage} af {pages}</span><Button variant="outline" size="sm" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Næste</Button></div></nav>
  </div>;
}
