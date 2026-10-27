'use client';

import { useState } from 'react';
import type { Topping, ToppingGroup } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type ProductToppingOverride = { price?: number; isDefault?: boolean; defaultQuantity?: number; isAvailable?: boolean };
export type ProductToppingOverrides = Record<string, ProductToppingOverride>;
type Group = ToppingGroup & { kind?: 'addition' | 'removal'; displayName?: string };
type Option = Topping & { maxQuantity?: number; productId?: string };

type Props = {
  groups: Group[];
  toppings: Option[];
  selectedGroupIds: string[];
  overrides: ProductToppingOverrides;
  onGroupsChange: (ids: string[]) => void;
  onOverridesChange: (value: ProductToppingOverrides) => void;
};

function inheritedChoice(value: boolean | undefined) { return value === undefined ? 'inherit' : value ? 'yes' : 'no'; }
const selectClass = 'h-10 w-full min-w-32 rounded-md border border-input bg-background px-2 text-sm';

export function ProductToppingEditor({ groups, toppings, selectedGroupIds, overrides, onGroupsChange, onOverridesChange }: Props) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const visibleGroups = groups.filter(g => `${g.groupName} ${g.displayName || ''}`.toLocaleLowerCase('da').includes(search.toLocaleLowerCase('da')))
    .sort((a, b) => a.groupName.localeCompare(b.groupName, 'da'));
  const pageCount = Math.max(1, Math.ceil(visibleGroups.length / 12));
  const currentPage = Math.min(page, pageCount - 1);
  function setField(id: string, key: keyof ProductToppingOverride, value: number | boolean | undefined) {
    const next = { ...overrides, [id]: { ...overrides[id], [key]: value } };
    if (value === undefined) delete next[id][key];
    if ((key === 'isDefault' || key === 'isAvailable') && value === false) delete next[id].defaultQuantity;
    if (key === 'isAvailable' && value === false) next[id].isDefault = false;
    if (!Object.keys(next[id]).length) delete next[id];
    onOverridesChange(next);
  }
  function toggleGroup(id: string, checked: boolean) {
    if (checked) onGroupsChange([...selectedGroupIds, id]);
    else {
      onGroupsChange(selectedGroupIds.filter(groupId => groupId !== id));
    }
  }
  function move(index: number, direction: -1 | 1) {
    const next = [...selectedGroupIds];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onGroupsChange(next);
  }
  return <section className="space-y-4" aria-label="Produktspecifikke tilvalg">
    <div>
      <h3 className="font-semibold">Tilvalgsgrupper</h3>
      <p className="text-sm text-muted-foreground">Vælg grupper, og tilpas kun de valg, der skal være anderledes på dette produkt.</p>
    </div>
    <Input aria-label="Søg i tilvalgsgrupper" placeholder="Søg i tilvalgsgrupper…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
    <div className="max-h-64 overflow-auto rounded-md border divide-y">
      {visibleGroups.slice(currentPage * 12, currentPage * 12 + 12).map(group => <label key={group.id} className="flex cursor-pointer items-center gap-3 p-3 text-sm">
        <input type="checkbox" checked={selectedGroupIds.includes(group.id)} onChange={e => toggleGroup(group.id, e.target.checked)} />
        <span className="flex-1">{group.groupName}{group.displayName && group.displayName !== group.groupName && <span className="block text-xs text-muted-foreground">Kunden ser: {group.displayName}</span>}</span>
        {group.kind === 'removal' && <span className="text-xs text-muted-foreground">Fravalg</span>}
      </label>)}
      {!visibleGroups.length && <p className="p-3 text-sm text-muted-foreground">Ingen tilvalgsgrupper matcher søgningen.</p>}
    </div>
    {pageCount > 1 && <div className="flex items-center justify-between gap-2 text-sm">
      <Button type="button" variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Forrige grupper</Button>
      <span>Side {currentPage + 1} af {pageCount}</span>
      <Button type="button" variant="outline" size="sm" disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>Næste grupper</Button>
    </div>}
    {selectedGroupIds.length > 0 && <p className="text-sm text-muted-foreground">Rækkefølgen nedenfor bruges hos kunden. Åbn en gruppe for priser og standardvalg. Tom pris arver standardprisen; 0 kr. betyder gratis.</p>}
    {selectedGroupIds.map((id, index) => {
      const group = groups.find(g => g.id === id);
      if (!group) return null;
      return <div key={id} className="rounded-md border">
        <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
          <span className="text-sm font-medium">{index + 1}. {group.groupName}</span>
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" aria-label={`Flyt ${group.groupName} op`} disabled={index === 0} onClick={() => move(index, -1)}>Op</Button>
            <Button type="button" variant="ghost" size="sm" aria-label={`Flyt ${group.groupName} ned`} disabled={index === selectedGroupIds.length - 1} onClick={() => move(index, 1)}>Ned</Button>
          </div>
        </div>
        <GroupOptions group={group} options={toppings.filter(t => t.groupId === id)} overrides={overrides} setField={setField} />
      </div>;
    })}
  </section>;
}

function GroupOptions({ group, options, overrides, setField }: {
  group: Group; options: Option[]; overrides: ProductToppingOverrides;
  setField: (id: string, key: keyof ProductToppingOverride, value: number | boolean | undefined) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const matches = options.filter(t => t.toppingName.toLocaleLowerCase('da').includes(search.toLocaleLowerCase('da')))
    .sort((a,b) => a.toppingName.localeCompare(b.toppingName, 'da'));
  const pageCount = Math.max(1, Math.ceil(matches.length / 10));
  const currentPage = Math.min(page, pageCount - 1);
  const removal = group.kind === 'removal';
  return <details className="p-3">
    <summary className="cursor-pointer text-sm font-medium">Tilpas {options.length} {removal ? 'fravalg' : 'tilvalg'}</summary>
    {removal && <p className="mt-3 text-sm text-muted-foreground">Fravalg koster 0 kr. og vælges altid aktivt af kunden. Skjul ingredienser, som dette produkt ikke indeholder.</p>}
    <Input className="my-3" aria-label={`Søg tilvalg i ${group.groupName}`} placeholder="Søg tilvalg…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th className="p-2">Tilvalg</th><th className="p-2">Tilgængelighed</th>{!removal && <><th className="p-2">Pris på produktet</th><th className="p-2">Standardvalg</th><th className="p-2">Standardantal</th></>}</tr></thead>
        <tbody>{matches.slice(currentPage * 10, currentPage * 10 + 10).map(option => {
          const override = overrides[option.id] || {};
          return <tr key={option.id} className="border-b align-top">
            <td className="p-2 min-w-36">{option.toppingName}{!option.isActive && <span className="block text-xs text-muted-foreground">Inaktiv i kataloget</span>}</td>
            <td className="p-2"><select className={selectClass} aria-label={`Tilgængelighed: ${option.toppingName}`} value={inheritedChoice(override.isAvailable)} onChange={e => setField(option.id, 'isAvailable', e.target.value === 'inherit' ? undefined : e.target.value === 'yes')}><option value="inherit">Arv (tilgængeligt)</option><option value="yes">Vis</option><option value="no">Skjul</option></select></td>
            {!removal && <>
              <td className="p-2 min-w-36"><Input aria-label={`Pris: ${option.toppingName}`} type="number" min="0" max="100000" step="0.01" placeholder={option.productId ? 'Produktpris' : `${option.price.toFixed(2)} kr.`} value={override.price ?? ''} onChange={e => setField(option.id, 'price', e.target.value === '' ? undefined : Number(e.target.value))} /><span className="text-xs text-muted-foreground">{option.productId ? 'Arver tilknyttet produkts pris' : `Standard: ${option.price.toLocaleString('da-DK')} kr.`}</span></td>
              <td className="p-2"><select className={selectClass} aria-label={`Standardvalg: ${option.toppingName}`} value={inheritedChoice(override.isDefault)} onChange={e => setField(option.id, 'isDefault', e.target.value === 'inherit' ? undefined : e.target.value === 'yes')}><option value="inherit">Arv ({option.isDefault ? 'valgt' : 'ikke valgt'})</option><option value="yes">Valgt</option><option value="no">Ikke valgt</option></select></td>
              <td className="p-2 min-w-32"><Input aria-label={`Standardantal: ${option.toppingName}`} type="number" min="1" max={option.maxQuantity ?? 1} step="1" placeholder="1" value={override.defaultQuantity ?? ''} disabled={override.isDefault === false || (override.isDefault === undefined && !option.isDefault)} onChange={e => setField(option.id, 'defaultQuantity', e.target.value === '' ? undefined : Number(e.target.value))} /><span className="text-xs text-muted-foreground">Maks. {option.maxQuantity ?? 1}</span></td>
            </>}
          </tr>;
        })}</tbody>
      </table>
      {!matches.length && <p className="p-3 text-sm text-muted-foreground">Ingen tilvalg matcher søgningen.</p>}
    </div>
    {pageCount > 1 && <div className="mt-3 flex items-center justify-between gap-2 text-sm"><Button type="button" size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Forrige tilvalg</Button><span>Side {currentPage + 1} af {pageCount}</span><Button type="button" size="sm" variant="outline" disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>Næste tilvalg</Button></div>}
  </details>;
}
