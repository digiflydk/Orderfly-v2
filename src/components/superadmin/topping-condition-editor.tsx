'use client';

import type { Topping, ToppingGroup } from '@/types';

type Props = {
  groups: ToppingGroup[];
  toppings: Topping[];
  value: Record<string, string[]>;
  onChange: (value: Record<string, string[]>) => void;
};

export function ToppingConditionEditor({ groups, toppings, value, onChange }: Props) {
  if (!groups.length && !Object.keys(value).length) return null;
  return <fieldset className="space-y-4 rounded-md border p-4">
    <legend className="px-1 font-medium">Betingede tilvalg</legend>
    <p className="text-sm text-muted-foreground">Et valg kan åbne flere grupper, fx både drikkevarer og pommes frites ved valg af Menu. Gruppen vises, når mindst ét af de markerede valg er valgt. Reglerne gælder kun dette produkt.</p>
    {[...new Set([...groups.map(g => g.id), ...Object.keys(value)])].map(id => {
      const group = groups.find(g => g.id === id);
      const conditional = Object.hasOwn(value, id);
      const options = toppings.filter(t => t.isActive && t.groupId !== id && !Object.hasOwn(value, t.groupId) && groups.some(g => g.id === t.groupId));
      return <div key={id} className="space-y-2 rounded border p-3">
        <label className="flex flex-wrap items-center justify-between gap-2">
          <span>{group?.groupName || 'Fjernet gruppe: fjern reglen'}{group && <small className="ml-2 text-muted-foreground">Min. {group.minSelection}, maks. {group.maxSelection}</small>}</span>
          <select aria-label={`Synlighed for ${group?.groupName || id}`} className="rounded border bg-background p-2" value={conditional ? 'conditional' : 'always'} onChange={event => {
            const next = { ...value };
            if (event.target.value === 'always') delete next[id]; else next[id] = [];
            onChange(next);
          }}>
            <option value="always">Vis altid</option>
            <option value="conditional">Vis ved bestemte valg</option>
          </select>
        </label>
        {conditional && <div className="space-y-2">
          {!options.length && <p className="text-sm">Tilknyt først en altid synlig gruppe med aktive tilvalg.</p>}
          {options.map(option => <label key={option.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value[id].includes(option.id)} onChange={event => onChange({ ...value, [id]: event.target.checked ? [...value[id], option.id] : value[id].filter(trigger => trigger !== option.id) })} />
            {groups.find(g => g.id === option.groupId)?.groupName} · {option.toppingName}
          </label>)}
          {value[id].filter(trigger => !options.some(option => option.id === trigger)).map(trigger => <label key={trigger} className="flex items-center gap-2 text-sm text-destructive">
            <input type="checkbox" checked onChange={() => onChange({ ...value, [id]: value[id].filter(item => item !== trigger) })} />
            Utilgængeligt valg: fjern og vælg igen
          </label>)}
          {!value[id].length && <p role="alert" className="text-sm text-destructive">Vælg mindst ét aktiverende tilvalg.</p>}
        </div>}
      </div>;
    })}
  </fieldset>;
}
