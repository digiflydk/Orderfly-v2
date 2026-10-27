'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Topping, ToppingGroup, Location, Brand, Product } from '@/types';
import { createOrUpdateTopping, deleteTopping } from '@/app/superadmin/toppings/actions';

type Option = Topping & { maxQuantity?: number; productId?: string };
type Group = ToppingGroup & { kind?: 'addition' | 'removal' };
interface Props { topping?: Option | null; locations: Location[]; allGroups: Group[]; brands: Brand[]; products?: Product[]; initialGroupId?: string; }
const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
function SaveButton() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? 'Gemmer…' : 'Gem tilvalg'}</Button>; }
export function ToppingFormPage({ topping, locations, allGroups, brands, products = [], initialGroupId }: Props) {
  const router = useRouter();
  const initialGroup = allGroups.find(g => g.id === initialGroupId);
  const initialLocations = topping?.locationIds || initialGroup?.locationIds || [];
  const [state, action] = useActionState(createOrUpdateTopping, null);
  const [name, setName] = useState(topping?.toppingName || '');
  const [brand, setBrand] = useState(locations.find(l => initialLocations.includes(l.id))?.brandId || '');
  const [selectedLocations, setSelectedLocations] = useState(initialLocations);
  const [groupId, setGroupId] = useState(topping?.groupId || initialGroup?.id || '');
  const [productId, setProductId] = useState(topping?.productId || '');
  const [price, setPrice] = useState(String(topping?.price ?? 0));
  const [maxQuantity, setMaxQuantity] = useState(String(topping?.maxQuantity ?? 1));
  const [sortOrder, setSortOrder] = useState(String(topping?.sortOrder ?? 0));
  const [isActive, setActive] = useState(topping?.isActive ?? true);
  const [isDefault, setDefault] = useState(topping?.isDefault ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, startDelete] = useTransition();
  const group = allGroups.find(g => g.id === groupId);
  const removal = group?.kind === 'removal';
  const groups = allGroups.filter(g => selectedLocations.length > 0 && selectedLocations.every(id => g.locationIds.includes(id)));
  const availableProduct = (p: Product, ids: string[]) => p.isActive && p.brandId === brand && !p.toppingGroupIds?.length && ids.length > 0 && Array.isArray(p.locationIds) && (p.locationIds.length === 0 || ids.every(id => p.locationIds.includes(id)));
  const candidates = products.filter(p => availableProduct(p, selectedLocations));
  const linked = candidates.find(p => p.id === productId);
  const locationChanged = (ids: string[]) => { setSelectedLocations(ids); if (!allGroups.some(g => g.id === groupId && ids.length > 0 && ids.every(id => g.locationIds.includes(id)))) setGroupId(''); if (!products.some(p => p.id === productId && availableProduct(p, ids))) setProductId(''); };
  return <div className="space-y-6"><Link href="/superadmin/toppings" className="text-sm underline">Tilbage til tilvalg</Link>
    <form action={action} className="space-y-6">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background py-4"><div><h1 className="text-2xl font-bold">{topping ? 'Rediger tilvalg' : 'Opret tilvalg'}</h1><p className="text-sm text-muted-foreground">Indstil pris, antal og tilgængelighed.</p></div><SaveButton /></header>
      {topping && <input type="hidden" name="id" value={topping.id} />}
      {state?.error && <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">{state.message}</p>}
      <section className="rounded-md border p-5"><h2 className="mb-4 font-semibold">Tilgængelighed</h2><div className="grid gap-5 md:grid-cols-3"><label className="space-y-1 text-sm">Brand<select aria-label="Brand" className={selectClass} required value={brand} onChange={e=>{setBrand(e.target.value);locationChanged([]);setProductId('');}}><option value="">Vælg brand</option>{[...brands].sort((a,b)=>a.name.localeCompare(b.name,'da')).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="space-y-1 text-sm">Tilvalgsgruppe<select aria-label="Tilvalgsgruppe" className={selectClass} name="groupId" required value={groupId} onChange={e=>{setGroupId(e.target.value);if(allGroups.find(g=>g.id===e.target.value)?.kind==='removal'){setProductId('');setDefault(false);}}}><option value="">Vælg gruppe</option>{[...groups].sort((a,b)=>a.groupName.localeCompare(b.groupName,'da')).map(g=><option key={g.id} value={g.id}>{g.groupName}</option>)}</select><span className="block text-xs text-muted-foreground">Vælg lokationer først. Gruppen skal dække alle valgte lokationer.</span></label></div><fieldset className="mt-4"><legend className="mb-2 text-sm font-medium">Lokationer</legend><div className="grid max-h-60 gap-3 overflow-y-auto md:grid-cols-3">{locations.filter(l=>l.brandId===brand || selectedLocations.includes(l.id)).sort((a,b)=>a.name.localeCompare(b.name,'da')).map(l=><label key={l.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="locationIds" value={l.id} checked={selectedLocations.includes(l.id)} onChange={e=>locationChanged(e.target.checked?[...selectedLocations,l.id]:selectedLocations.filter(id=>id!==l.id))}/>{l.name}</label>)}</div>{!brand&&<p className="text-sm text-muted-foreground">Vælg et brand for at se lokationerne.</p>}</fieldset></section>
      <section className="rounded-md border p-5"><h2 className="mb-4 font-semibold">Stamdata</h2><div className="grid gap-5 md:grid-cols-3">
        <label className="space-y-1 text-sm">Tilvalgets navn<Input name="toppingName" required minLength={2} maxLength={200} value={name} onChange={e=>setName(e.target.value)} placeholder={removal?'Fx løg':'Fx ekstra ost'} /></label>
        <label className="space-y-1 text-sm">Genbrug produkt<select aria-label="Genbrug produkt" className={selectClass} name="productId" value={removal?'':productId} disabled={removal} onChange={e=>{setProductId(e.target.value); const product=candidates.find(p=>p.id===e.target.value);if(product){setName(product.productName);setPrice(String(product.price));}}}><option value="">Intet, selvstændigt tilvalg</option>{productId && !linked && <option value={productId}>Tilknyttet produkt er ikke længere tilgængeligt</option>}{[...candidates].sort((a,b)=>a.productName.localeCompare(b.productName,'da')).map(p=><option key={p.id} value={p.id}>{p.productName}</option>)}</select>{removal&&<input type="hidden" name="productId" value=""/>}<span className="block text-xs text-muted-foreground">Et tilknyttet produkt leverer aktuelt navn og pris for både afhentning og levering. Prisen ændres på kildeproduktet og kan ikke overskrives på moderproduktet. Kun aktive produkter uden egne tilvalgsgrupper kan vælges.</span></label>
        {productId && !removal ? <div className="space-y-1 text-sm" role="status" aria-label="Tilknyttet produktpris"><p className="font-medium">Følger produktets pris</p><input type="hidden" name="price" value={linked?.price ?? price} />{linked ? <><p>Afhentning: {linked.price.toLocaleString('da-DK')} kr.</p><p>Levering: {(linked.priceDelivery ?? linked.price).toLocaleString('da-DK')} kr.</p></> : <p>Produktet er ikke længere tilgængeligt. Vælg et andet produkt eller et selvstændigt tilvalg.</p>}<p className="text-xs text-muted-foreground">Beløbene opdateres fra kildeproduktet ved bestilling.</p></div> : <label className="space-y-1 text-sm">Pris (kr.)<Input name="price" type="number" required min={0} step="0.01" value={removal?'0':price} readOnly={removal} onChange={e=>setPrice(e.target.value)} /><span className="block text-xs text-muted-foreground">{removal ? 'Fravalg er altid gratis.' : 'Prisen kan tilpasses på det enkelte moderprodukt.'}</span></label>}
        <label className="space-y-1 text-sm">Maks. antal af samme tilvalg<Input name="maxQuantity" type="number" required min={1} max={50} step={1} value={removal?'1':maxQuantity} readOnly={removal} onChange={e=>setMaxQuantity(e.target.value)} /></label>
        <label className="space-y-1 text-sm">Rækkefølge<Input name="sortOrder" type="number" min={0} step={1} value={sortOrder} onChange={e=>setSortOrder(e.target.value)} /></label>
      </div>{removal&&<p className="mt-4 rounded-md bg-muted p-3 text-sm">Kunden ser “Uden {name || 'ingrediens'}”. Fravalg er gratis og aldrig valgt som standard.</p>}</section>
      <section className="grid gap-4 rounded-md border p-5 md:grid-cols-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" checked={isActive} onChange={e=>setActive(e.target.checked)} />Aktivt tilvalg</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" checked={!removal&&isDefault} disabled={removal} onChange={e=>setDefault(e.target.checked)} />Valgt som standard</label>{!removal && <p className="text-sm text-muted-foreground md:col-span-3">Vil du tilbyde et gratis standardvalg? Brug et selvstændigt tilvalg med pris 0 kr. og markér “Valgt som standard”. Du kan også indstille det på det enkelte moderprodukt.</p>}</section>
      <div className="flex justify-end gap-3"><Button variant="outline" asChild><Link href="/superadmin/toppings">Annuller</Link></Button><SaveButton /></div>
    </form>
    {topping&&<section className="rounded-md border p-5"><h2 className="font-semibold">Slet tilvalg</h2><p className="my-2 text-sm text-muted-foreground">Sletning er permanent. Tilvalg med produktreferencer kan ikke slettes.</p>{deleteError&&<p role="alert" className="mb-2 text-sm text-destructive">{deleteError}</p>}{confirmDelete?<div className="flex flex-wrap items-center gap-3"><span className="text-sm">Slet “{topping.toppingName}” permanent?</span><Button variant="outline" disabled={deleting} onClick={()=>setConfirmDelete(false)}>Annuller</Button><Button variant="destructive" disabled={deleting} onClick={()=>startDelete(async()=>{try{const result=await deleteTopping(topping.id);if(result.error)setDeleteError(result.message);else{router.push('/superadmin/toppings');router.refresh();}}catch{setDeleteError('Tilvalget kunne ikke slettes. Prøv igen.');}})}>Bekræft sletning</Button></div>:<Button variant="destructive" onClick={()=>setConfirmDelete(true)}>Slet tilvalg</Button>}</section>}
  </div>;
}
