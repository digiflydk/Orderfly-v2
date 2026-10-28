'use client';

import { useState } from 'react';
import { Minus, Plus, ChevronDown } from 'lucide-react';
import type { CartItemTopping, ToppingGroup } from '@/types';
import { toppingLabel, type EffectiveTopping } from '@/lib/topping-options';
import { MAX_TOPPINGS_PER_ITEM } from '@/lib/commerce-limits';
import { formatPrice } from '@/lib/storefront-format';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { presentOptionChoices } from '@/lib/option-presentation';

type Props = {
  group: ToppingGroup & { toppings: EffectiveTopping[] };
  initiallyExpanded?: boolean;
  dialogId: string;
  selectedToppings: Record<string, CartItemTopping>;
  showErrors: boolean;
  selectionText: string;
  onQuantity: (option: EffectiveTopping, count: number) => void;
};

/** Presentation state never changes the customer's selections. */
export function ProductOptionGroup({group, initiallyExpanded = false, dialogId, selectedToppings, showErrors, selectionText, onQuantity}: Props) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const required = group.minSelection > 0;
  const single = group.selectionMode === 'single' || group.maxSelection === 1;
  const selectedOptions = group.toppings.filter(option => selectedToppings[option.id]);
  const count = selectedOptions.reduce((sum, option) => sum + (selectedToppings[option.id]?.quantity ?? 0), 0);
  const total = Object.values(selectedToppings).reduce((sum, option) => sum + (option.quantity ?? 1), 0);
  const invalid = count < group.minSelection || (group.maxSelection > 0 && count > group.maxSelection);
  const open = required || expanded || (showErrors && invalid);
  const name = group.displayName || group.groupName;
  const headingId = `${dialogId}-heading-${group.id}`;
  const contentId = `${dialogId}-options-${group.id}`;
  const selectedSummary = selectedOptions.map(option => toppingLabel(option, selectedToppings[option.id].quantity ?? 1)).join(', ');
  const query = search.trim().toLocaleLowerCase('da');
  const { matches, visible: visibleOptions } = presentOptionChoices(group.toppings, new Set(selectedOptions.map(option => option.id)), search, showAll, option => toppingLabel(option));
  const limitReached = !single && group.maxSelection > 0 && count >= group.maxSelection;
  const globalLimitReached = total >= MAX_TOPPINGS_PER_ITEM;
  const limitMessage = limitReached ? `Du har valgt ${count} af ${group.maxSelection}. Fjern et valg for at vælge noget andet.`
    : globalLimitReached ? 'Du har nået grænsen for tilvalg. Fjern et valg for at tilføje et andet.' : '';
  return <section id={`${dialogId}-group-${group.id}`} aria-labelledby={headingId} tabIndex={-1} className="commerce-option-group" data-invalid={showErrors && invalid}>
    <div className="mb-1">
      <h3 id={headingId} className="font-semibold text-base">
        {required ? name : <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 text-left" aria-expanded={open} aria-controls={contentId} onClick={() => setExpanded(!open)}>
          <span>{name}</span><ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </button>}
      </h3>
      <p className="text-xs text-muted-foreground">{required ? 'Påkrævet' : 'Valgfrit'} · {selectionText}{single && group.maxSelection !== 1 ? ' · Én slags ad gangen' : ''}{count > 0 && !single ? ` · ${count} valgt` : ''}</p>
      {!required && !open && selectedSummary && <p className="text-sm break-words">{selectedSummary}</p>}
      {showErrors && invalid && <p role="alert" className="text-sm text-destructive">{selectionText} for at fortsætte.</p>}
    </div>
    {open && <div id={contentId}>
      {group.kind === 'removal' && <p className="text-xs text-muted-foreground">Markér de ingredienser, du ønsker fjernet.</p>}
      {group.toppings.length > 10 && <Input className="my-2 text-base md:text-base" aria-label={`Søg i ${name}`} placeholder={`Søg blandt ${group.toppings.length} tilvalg…`} value={search} onChange={event => setSearch(event.target.value)} />}
      {query && <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span role="status">{matches.length} {matches.length === 1 ? 'resultat' : 'resultater'}</span><Button type="button" variant="ghost" className="min-h-11 px-2" onClick={() => setSearch('')}>Ryd søgning</Button></div>}
      {limitMessage && <p role="status" className="my-2 text-xs text-muted-foreground">{limitMessage}</p>}
      <div className="space-y-0" role={single ? 'radiogroup' : 'group'} aria-labelledby={headingId}>
        {single && !required && <label className="flex min-h-11 cursor-pointer items-center gap-3 px-2 py-2">
          <input type="radio" name={`${dialogId}-${group.id}`} checked={count === 0} onChange={() => selectedOptions.forEach(option => onQuantity(option, 0))} className="h-5 w-5 shrink-0 accent-orange-600" />
          <span>Ingen</span>
        </label>}
        {visibleOptions.map(topping => {
          const selectedQuantity = selectedToppings[topping.id]?.quantity ?? 0;
          const selected = selectedQuantity > 0;
          const replacing = single && !selected;
          const groupRemaining = group.maxSelection === 0 || count < group.maxSelection || replacing;
          const totalRemaining = total < MAX_TOPPINGS_PER_ITEM || (replacing && count > 0);
          const label = toppingLabel(topping);
          const priceId = topping.kind === 'removal' ? undefined : `${dialogId}-${topping.id}-price`;
          return <div key={topping.id} data-option-row className="flex flex-wrap items-center justify-between gap-x-2 min-h-11 px-2 rounded-md hover:bg-accent">
            <label htmlFor={`${dialogId}-${topping.id}`} className="commerce-option-label flex min-h-11 items-center gap-3 cursor-pointer">
              {single ? <input type="radio" data-state={selected ? 'checked' : 'unchecked'} aria-label={label} aria-describedby={priceId} id={`${dialogId}-${topping.id}`} name={`${dialogId}-${group.id}`} checked={selected} onChange={() => onQuantity(topping, 1)} disabled={!selected && (!groupRemaining || !totalRemaining)} className="h-5 w-5 shrink-0 accent-orange-600" /> :
                <Checkbox aria-label={label} aria-describedby={priceId} id={`${dialogId}-${topping.id}`} checked={selected} onCheckedChange={checked => onQuantity(topping, checked === true ? 1 : 0)} disabled={!selected && (!groupRemaining || !totalRemaining)} />}
              <span className="min-w-0 font-normal break-words">{label}</span>
            </label>
            {topping.kind !== 'removal' && <label htmlFor={`${dialogId}-${topping.id}`} id={priceId} data-option-price className="flex min-h-11 shrink-0 cursor-pointer items-center whitespace-nowrap text-sm text-muted-foreground">{topping.price === 0 ? 'Inkluderet' : `+${formatPrice(topping.price)}${topping.maxQuantity > 1 ? ' / stk.' : ''}`}</label>}
            {topping.maxQuantity > 1 && selected && <div data-option-stepper className="ml-auto flex items-center gap-1" role="group" aria-label={`Antal ${label}`}>
              <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label={`Færre ${label}`} onClick={() => onQuantity(topping, selectedQuantity - 1)}><Minus className="h-4 w-4" /></Button>
              <output className="w-6 text-center tabular-nums" aria-label={`Valgt antal ${label}`}>{selectedQuantity}</output>
              <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label={`Flere ${label}`} disabled={selectedQuantity >= topping.maxQuantity || !groupRemaining || !totalRemaining} onClick={() => onQuantity(topping, selectedQuantity + 1)}><Plus className="h-4 w-4" /></Button>
            </div>}
          </div>;
        })}
      </div>
      {query && matches.length === 0 && <p className="py-2 text-sm">Ingen tilvalg matcher søgningen.{selectedOptions.length > 0 ? ' Dine valgte tilvalg vises stadig.' : ''}</p>}
      {group.toppings.length > 6 && !query && <Button type="button" variant="ghost" className="min-h-11 w-full" onClick={() => setShowAll(!showAll)}>{showAll ? 'Vis færre' : `Vis alle (${group.toppings.length})`}</Button>}
    </div>}
  </section>;
}
