'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ToppingGroup, Topping, Location, Brand } from '@/types';
import { createOrUpdateToppingGroup, deleteToppingGroup } from '@/app/superadmin/toppings/actions';

type Group = ToppingGroup & { displayName?: string; kind?: 'addition'|'removal'; selectionMode?: 'single'|'multiple'; sortOrder?: number };
interface Props { group?: Group | null; locations: Location[]; brands: Brand[]; toppings?: Topping[]; usage?: { products: { id: string; name: string }[]; count: number }; }
const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
function SaveButton() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? 'Gemmer…' : 'Gem tilvalgsgruppe'}</Button>; }
export function ToppingGroupFormPage({ group, locations, brands, toppings = [], usage }: Props) {
  const router = useRouter();
  const [state, action] = useActionState(createOrUpdateToppingGroup, null);
  const [brand, setBrand] = useState(locations.find(l => group?.locationIds.includes(l.id))?.brandId || '');
  const [selectedLocations, setSelectedLocations] = useState(group?.locationIds || []);
  const [name, setName] = useState(group?.groupName || '');
  const [displayName, setDisplayName] = useState(group?.displayName || '');
  const [kind, setKind] = useState(group?.kind || 'addition');
  const [mode, setMode] = useState(group?.selectionMode || 'multiple');
  const [minimum, setMinimum] = useState(String(group?.minSelection ?? 0));
  const [maximum, setMaximum] = useState(String(group?.maxSelection ?? 0));
  const [sortOrder, setSortOrder] = useState(String(group?.sortOrder ?? 0));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, startDelete] = useTransition();
  const used = (usage?.count ?? 0) > 0;
  return <div className="space-y-6">
    <Link href="/superadmin/toppings" className="text-sm underline">Tilbage til tilvalgsgrupper</Link>
    <form action={action} className="space-y-6">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background py-4"><div><h1 className="text-2xl font-bold">{group ? 'Rediger tilvalgsgruppe' : 'Opret tilvalgsgruppe'}</h1><p className="text-sm text-muted-foreground">Indstil valgregler og hvor gruppen er tilgængelig.</p></div><SaveButton /></header>
      {group && <input type="hidden" name="id" value={group.id} />}
      {state?.error && <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">{state.message}</p>}
      <section aria-labelledby="group-details" className="rounded-md border p-5"><h2 id="group-details" className="mb-4 font-semibold">Stamdata</h2><div className="grid gap-5 md:grid-cols-3">
        <label className="space-y-1 text-sm">Internt navn<Input name="groupName" required minLength={2} maxLength={200} value={name} onChange={e => setName(e.target.value)} placeholder="Fx drikkevarer i menu" /></label>
        <label className="space-y-1 text-sm">Visningsnavn<Input name="displayName" maxLength={200} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Fx vælg drikkevare" /><span className="block text-xs text-muted-foreground">Tomt felt bruger det interne navn.</span></label>
        <label className="space-y-1 text-sm">Type<select aria-label="Type" name="kind" className={selectClass} value={kind} onChange={e => { setKind(e.target.value as 'addition'|'removal'); if (e.target.value === 'removal') setMinimum('0'); }}><option value="addition">Tilvalg</option><option value="removal">Fravalg af ingredienser</option></select></label>
        <label className="space-y-1 text-sm">Valg af typer<select aria-label="Valg af typer" name="selectionMode" className={selectClass} value={mode} onChange={e => setMode(e.target.value as 'single'|'multiple')}><option value="multiple">Flere forskellige typer</option><option value="single">Kun én type</option></select><span className="block text-xs text-muted-foreground">Antallet af samme tilvalg styres på tilvalget.</span></label>
        <label className="space-y-1 text-sm">Minimum, samlet antal<Input name="minSelection" type="number" required min={0} max={50} step={1} value={kind === 'removal' ? '0' : minimum} readOnly={kind === 'removal'} onChange={e => setMinimum(e.target.value)} /></label>
        <label className="space-y-1 text-sm">Maksimum, samlet antal<Input name="maxSelection" type="number" required min={0} max={50} step={1} value={maximum} onChange={e => setMaximum(e.target.value)} /><span className="block text-xs text-muted-foreground">0 betyder ingen gruppegrænse.</span></label>
        <label className="space-y-1 text-sm">Rækkefølge<Input name="sortOrder" type="number" min={0} step={1} value={sortOrder} onChange={e => setSortOrder(e.target.value)} /></label>
      </div>{kind === 'removal' && <p className="mt-4 rounded-md bg-muted p-3 text-sm">Fravalg vises som “Uden …”. De er gratis, vælges aktivt af kunden og har højst ét af hver ingrediens.</p>}</section>
      <section aria-labelledby="group-locations" className="rounded-md border p-5"><h2 id="group-locations" className="mb-4 font-semibold">Tilgængelighed</h2><label className="block max-w-sm space-y-1 text-sm">Brand<select aria-label="Brand" className={selectClass} required value={brand} onChange={e => { setBrand(e.target.value); setSelectedLocations([]); }}><option value="">Vælg brand</option>{[...brands].sort((a,b)=>a.name.localeCompare(b.name,'da')).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><fieldset className="mt-4"><legend className="mb-2 text-sm font-medium">Lokationer</legend><div className="grid max-h-60 gap-3 overflow-y-auto md:grid-cols-3">{locations.filter(l => l.brandId === brand || selectedLocations.includes(l.id)).sort((a,b)=>a.name.localeCompare(b.name,'da')).map(l => <label key={l.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="locationIds" value={l.id} checked={selectedLocations.includes(l.id)} onChange={e => setSelectedLocations(ids => e.target.checked ? [...ids,l.id] : ids.filter(id=>id!==l.id))} />{l.name}</label>)}</div>{!brand && <p className="text-sm text-muted-foreground">Vælg et brand for at se lokationerne.</p>}</fieldset></section>
      <div className="flex justify-end gap-3"><Button variant="outline" asChild><Link href="/superadmin/toppings">Annuller</Link></Button><SaveButton /></div>
    </form>
    {group && <><section className="rounded-md border p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Tilvalg i gruppen ({toppings.length})</h2><Button asChild variant="outline"><Link href={`/superadmin/toppings/new-topping?groupId=${encodeURIComponent(group.id)}`}>Opret tilvalg</Link></Button></div><Table><TableHeader><TableRow><TableHead>Navn</TableHead><TableHead>Pris</TableHead><TableHead>Status</TableHead><TableHead>Handling</TableHead></TableRow></TableHeader><TableBody>{[...toppings].sort((a,b)=>(a.sortOrder??999)-(b.sortOrder??999)||a.toppingName.localeCompare(b.toppingName,'da')).map(t => <TableRow key={t.id}><TableCell>{t.toppingName}</TableCell><TableCell>{'productId' in t && t.productId ? 'Produktpris' : `${t.price.toLocaleString('da-DK',{minimumFractionDigits:2})} kr.`}</TableCell><TableCell>{t.isActive ? 'Aktiv' : 'Inaktiv'}</TableCell><TableCell><Link className="underline" href={`/superadmin/toppings/edit-topping/${t.id}`}>Rediger</Link></TableCell></TableRow>)}{!toppings.length && <TableRow><TableCell colSpan={4}>Der er endnu ingen tilvalg i gruppen.</TableCell></TableRow>}</TableBody></Table></section>
    <section className="rounded-md border p-5"><h2 className="mb-3 font-semibold">Bruges på {usage?.count ?? 0} produkter</h2>{usage?.products.length ? <ul className="grid gap-2 md:grid-cols-3">{usage.products.map(p => <li key={p.id}><Link className="text-sm underline" href={`/superadmin/products/edit/${p.id}`}>{p.name}</Link></li>)}</ul> : <p className="text-sm text-muted-foreground">Ingen tilknyttede produkter.</p>}</section>
    <section className="rounded-md border p-5"><h2 className="font-semibold">Slet tilvalgsgruppe</h2><p className="my-2 text-sm text-muted-foreground">Gruppen og dens tilvalg slettes permanent. En gruppe, der bruges på produkter, kan ikke slettes.</p>{deleteError && <p role="alert" className="mb-2 text-sm text-destructive">{deleteError}</p>}{confirmDelete ? <div className="flex flex-wrap items-center gap-3"><span className="text-sm">Slet “{group.groupName}” permanent?</span><Button variant="outline" disabled={deleting} onClick={()=>setConfirmDelete(false)}>Annuller</Button><Button variant="destructive" disabled={deleting || used} onClick={()=>startDelete(async()=>{try { const result=await deleteToppingGroup(group.id); if(result.error) setDeleteError(result.message); else {router.push('/superadmin/toppings');router.refresh();} } catch {setDeleteError('Gruppen kunne ikke slettes. Prøv igen.');}})}>Bekræft sletning</Button></div> : <Button variant="destructive" disabled={used} onClick={()=>setConfirmDelete(true)}>Slet gruppe</Button>}</section></>}
  </div>;
}
