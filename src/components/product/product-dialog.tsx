
'use client';
import { lineMoney, money, sumMoney } from '@/lib/money';
import { activeToppingGroupIds } from '@/lib/topping-conditions';
import { resolveToppingOptions, cartTopping, toppingLabel, toppingSelectionError, reconcileToppingQuantities, type EffectiveTopping } from '@/lib/topping-options';
import { MAX_TOPPINGS_PER_ITEM } from '@/lib/commerce-limits';

import { useState, useMemo, useEffect, useRef, useId } from 'react';
import Image from 'next/image';
import { Minus, Plus, X } from 'lucide-react';
import type { CartItem, ComboMenu, Topping, ToppingGroup, CartItemTopping, StandardDiscount, Allergen, ProductForMenu } from '@/types';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { CategoryIcon as DynamicIcon } from '../catalog/category-icon';
import { publicRead } from '@/lib/public-read';
import { useAnalytics } from '@/context/analytics-context';
import { safeImage } from '@/lib/images';
import {formatPrice} from '@/lib/storefront-format';
import {useStorefrontCatalog} from '@/context/storefront-catalog';
import {ComboBuilderDialog} from './combo-builder-dialog';

interface ProductDialogProps {
  product: ProductForMenu;
  initialItem?: CartItem;
  onAdded?: () => void;
  allToppingGroups: ToppingGroup[];
  allToppings: Topping[];
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  applicableDiscount?: StandardDiscount | null;
}

const getSelectionText = (group: ToppingGroup): string => {
  const min = Number(group.minSelection);
  const max = Number(group.maxSelection);

  if (max > 0 && min === max && max > 1) return `Vælg præcis ${min}`;
  if (min > 0 && max > 0 && min !== max) return `Vælg ${min} til ${max}`;
  if (min > 0 && max === 0) return `Vælg mindst ${min}`;
  if (max > 1 && min <= 1) return `Vælg op til ${max}`;
  if (max === 1 && min === 1) return `Vælg 1`;

  return max === 1 ? 'Vælg højst 1' : 'Vælg frit';
};


export function ProductDialog({ product, isOpen, setIsOpen, allToppingGroups, allToppings, applicableDiscount, initialItem, onAdded }: ProductDialogProps) {
  const {combos, products} = useStorefrontCatalog();
  const [upgrade, setUpgrade] = useState<ComboMenu | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const initialized = useRef('');
  const committed = useRef(false);
  const dialogId = useId();
  const [quantity, setQuantity] = useState(1);
  const [selectedToppings, setSelectedToppings] = useState<Record<string, CartItemTopping>>({});
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [allergenError, setAllergenError] = useState(false);
  const { cartReady, addToCart, deliveryType, location, cartTotal } = useCart();
  const { toast } = useToast();
  const { trackEvent, measurementKey } = useAnalytics();

  const effectiveOptions = useMemo(() => resolveToppingOptions(product, allToppingGroups, allToppings, products,
    location && deliveryType ? { brandId: product.brandId, locationId: location.id, deliveryType } : undefined),
    [product, allToppingGroups, allToppings, products, location?.id, deliveryType]);

  const configuredToppingGroups = useMemo(() => {
    const ids = product.toppingGroupIds || [];
    return ids.flatMap(id => allToppingGroups.filter(group => group.id === id)).map(group => ({
      ...group,
      toppings: effectiveOptions.filter(option => option.groupId === group.id)
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)),
    })).filter(group => group.toppings.length > 0 || group.minSelection > 0);
  }, [product.toppingGroupIds, allToppingGroups, effectiveOptions]);

  const relevantToppingGroups = useMemo(() => {
    const active = activeToppingGroupIds(product, configuredToppingGroups, effectiveOptions, Object.keys(selectedToppings));
    return configuredToppingGroups.filter(group => active.has(group.id));
  }, [product, configuredToppingGroups, effectiveOptions, selectedToppings]);

  const quantities = (selected: Record<string, CartItemTopping>) =>
    Object.fromEntries(Object.entries(selected).map(([id, option]) => [id, option.quantity ?? 1]));
  const reconcileSelection = (selected: Record<string, CartItemTopping>, previous?: Record<string, CartItemTopping>) => {
    const next = reconcileToppingQuantities(product, configuredToppingGroups, effectiveOptions, quantities(selected),
      MAX_TOPPINGS_PER_ITEM, previous === undefined ? undefined : quantities(previous));
    return Object.fromEntries(effectiveOptions.filter(option => next[option.id]).map(option => [option.id, cartTopping(option, next[option.id])]));
  };

  const finalPrice = product.price;

  useEffect(() => {
    if (!isOpen) {initialized.current = ''; return;}
    const key = `${product.id}/${location?.id}/${deliveryType}/${initialItem?.cartItemId || ''}`;
    if (isOpen && location && initialized.current !== key) {
      if (initialized.current) {setIsOpen(false); return;}
      initialized.current = key; committed.current = false; setShowErrors(false);
      setQuantity(initialItem?.quantity || 1);

      const selected = initialItem ? Object.fromEntries(initialItem.toppings.flatMap(option => {
        const match = effectiveOptions.find(candidate => option.id ? candidate.id === option.id : candidate.toppingName === option.name);
        const count = option.quantity ?? 1;
        return match && Number.isSafeInteger(count) && count > 0 && count <= match.maxQuantity ? [[match.id, cartTopping(match, count)]] : [];
      })) : {};
      setSelectedToppings(reconcileSelection(selected, initialItem ? selected : undefined));

      async function fetchAllergens() {
        if(product.allergenIds && product.allergenIds.length > 0) {
            setAllergenError(false);
            try {
              const all = await publicRead<Allergen[]>('/api/public/allergens');
              const productAllergens = all.filter(a => product.allergenIds?.includes(a.id));
              setAllergens(productAllergens);
            } catch { setAllergenError(true); }
        } else {
            setAllergens([]);
        }
      }
      fetchAllergens();


    }
  }, [isOpen, product, relevantToppingGroups, trackEvent, location, finalPrice, deliveryType, initialItem, setIsOpen]);

  // A visible product can become measurable after hydration or cookie consent.
  // Keep tracking separate from dialog initialization to preserve user choices.
  const trackedView = useRef('');
  useEffect(() => {
    if (!isOpen) { trackedView.current = ''; return; }
    if (!location) return;
    const key = `${product.id}/${location.id}/${measurementKey}`;
    if (trackedView.current !== key && trackEvent('view_product', {productId: product.id, locationId: location.id})) {
      trackedView.current = key;
    }
  }, [isOpen, product.id, location?.id, trackEvent, measurementKey]);

  const basePrice = useMemo(() => {
    return (product as any).basePrice ?? (deliveryType === 'delivery' ? (product.priceDelivery ?? product.price) : product.price);
  }, [product, deliveryType]);


  const handleToppingQuantity = (topping: EffectiveTopping, count: number) => {
    setSelectedToppings(previous => {
      const next: Record<string, CartItemTopping> = Object.assign(Object.create(null), previous);
      const group = relevantToppingGroups.find(group => group.id === topping.groupId);
      if (!group || !Number.isSafeInteger(count) || count < 0 || count > topping.maxQuantity) return previous;
      if (count > 0 && (group.selectionMode === 'single' || group.maxSelection === 1)) {
        group.toppings.forEach(option => { delete next[option.id]; });
      }
      if (count === 0) delete next[topping.id];
      else next[topping.id] = cartTopping(topping, count);
      const groupTotal = group.toppings.reduce((sum, option) => sum + (next[option.id]?.quantity ?? 0), 0);
      const total = Object.values(next).reduce((sum, option) => sum + (option.quantity ?? 1), 0);
      if (total > MAX_TOPPINGS_PER_ITEM || (group.maxSelection > 0 && groupTotal > group.maxSelection)) return previous;
      return reconcileSelection(next, previous);
    });
  };

  const toppingsTotal = sumMoney(Object.values(selectedToppings).map(topping => topping.price));
  const totalItemPrice = lineMoney(finalPrice, quantity, [toppingsTotal]);
  const selectionError = toppingSelectionError(product, configuredToppingGroups, effectiveOptions, quantities(selectedToppings), MAX_TOPPINGS_PER_ITEM);
  const isSelectionValid = selectionError === null;

  const handleAddToCart = () => {
    if (!cartReady || committed.current) return;
    if (!isSelectionValid) {
      setShowErrors(true);
      const group = relevantToppingGroups.find(g => {
        const n = g.toppings.reduce((sum, option) => sum + (selectedToppings[option.id]?.quantity ?? 0), 0);
        return n < Number(g.minSelection) || (Number(g.maxSelection) > 0 && n > Number(g.maxSelection));
      });
      const element = group && document.getElementById(`${dialogId}-group-${group.id}`);
      if (element) {element.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}); element.focus();}
      return;
    }
    const finalToppings = Object.values(selectedToppings);
    const saved = addToCart(product, quantity, finalToppings, basePrice, finalPrice, initialItem);
    if (saved === false) {toast({variant:'destructive',title:'Kurven blev ændret',description:'Luk tilvalg og åbn varen igen for at fortsætte.'}); return;}
    committed.current = true;
    onAdded?.();
    toast({title: initialItem ? 'Kurven er opdateret' : 'Tilføjet til kurven', description: `${quantity} × ${product.productName}`, duration: 2200});

    trackEvent('add_to_cart', {
        productId: product.id,
        productName: product.productName,
        price: finalPrice,
        quantity: quantity,
        locationId: location?.id,
        itemsCount: quantity,
        cartValue: totalItemPrice,
        deliveryType
    });

    setIsOpen(false);
  }

  const hasOptions = allergenError || allergens.length > 0 || relevantToppingGroups.length > 0;

  if (upgrade) return <ComboBuilderDialog combo={upgrade} brandProducts={products} initialItem={initialItem} initialQuantity={quantity} preselectedProductId={product.id} isOpen={isOpen} setIsOpen={open => {if (!open) setUpgrade(null);}} onSaved={() => {trackEvent('combo_upgrade_accepted',{productId:upgrade.id});setUpgrade(null); setIsOpen(false);}} />;
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent data-commerce-panel="options" className="p-0 flex flex-col h-full sm:max-h-[90vh] max-w-lg bg-[#FFF8F0]">
        <div className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
                <div className="commerce-option-header">
                  <div className="commerce-option-image"><Image src={safeImage(product.imageUrl)} alt="" fill sizes="88px" className="rounded-lg object-cover" /></div>
                  <DialogHeader className="text-left pr-6"><DialogTitle className="text-xl">{product.productName}</DialogTitle><DialogDescription>{product.description || 'Vælg dine tilvalg her.'}</DialogDescription><p className="font-semibold">{formatPrice(finalPrice)}</p></DialogHeader>
                </div>
                <div className="p-4 space-y-3">
                    {hasOptions && (
                        <>
                            {allergenError && <p role="status" className="text-sm">Allergenoplysninger kunne ikke indlæses. Kontakt restauranten ved allergi.</p>}
                        {allergens.length > 0 && (
                                <div>
                                    <h3 className="font-semibold text-lg mb-2">Allergener</h3>
                                    <div className="flex flex-wrap gap-2">
                                    {allergens.map(allergen => (
                                        <Badge key={allergen.id} variant="secondary" className="gap-1.5">
                                            {allergen.icon && <DynamicIcon name={allergen.icon} className="h-4 w-4" />}
                                            {allergen.allergenName}
                                        </Badge>
                                    ))}
                                    </div>
                                </div>
                            )}

                            {relevantToppingGroups.map(group => {
                              const single = group.selectionMode === 'single' || group.maxSelection === 1;
                              const count = group.toppings.reduce((sum, option) => sum + (selectedToppings[option.id]?.quantity ?? 0), 0);
                              const total = Object.values(selectedToppings).reduce((sum, option) => sum + (option.quantity ?? 1), 0);
                              const invalid = count < group.minSelection || (group.maxSelection > 0 && count > group.maxSelection);
                              return (
                                <section key={group.id} id={`${dialogId}-group-${group.id}`} aria-labelledby={`${dialogId}-heading-${group.id}`} tabIndex={-1} className="commerce-option-group" data-invalid={showErrors && invalid}>
                                  <div className="mb-1">
                                    <h3 id={`${dialogId}-heading-${group.id}`} className="font-semibold text-lg">{group.displayName || group.groupName}</h3>
                                    <p className="text-sm text-muted-foreground">{group.minSelection > 0 ? 'Påkrævet' : 'Valgfrit'} · {getSelectionText(group)}{single && group.maxSelection !== 1 ? ' · Én slags ad gangen' : ''}</p>
                                    {group.kind === 'removal' && <p className="text-xs text-muted-foreground">Markér de ingredienser, du ønsker fjernet.</p>}
                                    {showErrors && invalid && <p role="alert" className="text-sm text-destructive">{getSelectionText(group)} for at fortsætte.</p>}
                                  </div>
                                  <div className="space-y-0">
                                    {group.toppings.map(topping => {
                                      const selectedQuantity = selectedToppings[topping.id]?.quantity ?? 0;
                                      const selected = selectedQuantity > 0;
                                      const replacing = single && !selected;
                                      const groupRemaining = group.maxSelection === 0 || count < group.maxSelection || replacing;
                                      const totalRemaining = total < MAX_TOPPINGS_PER_ITEM || (replacing && count > 0);
                                      const label = toppingLabel(topping);
                                      return (
                                        <div key={topping.id} data-option-row className="flex flex-wrap items-center justify-between gap-2 min-h-12 px-2 py-2 rounded-md hover:bg-accent">
                                          <label htmlFor={`${dialogId}-${topping.id}`} className="flex flex-1 items-center gap-3 min-w-0 cursor-pointer">
                                            <Checkbox id={`${dialogId}-${topping.id}`} checked={selected}
                                              onCheckedChange={checked => handleToppingQuantity(topping, checked === true ? 1 : 0)}
                                              disabled={!selected && (!groupRemaining || !totalRemaining)} />
                                            <span className="font-normal break-words">{label}</span>
                                          </label>
                                          {topping.kind !== 'removal' && <span className="text-sm text-muted-foreground">{topping.price === 0 ? 'Inkluderet' : `+${formatPrice(topping.price)}${topping.maxQuantity > 1 ? ' / stk.' : ''}`}</span>}
                                          {topping.maxQuantity > 1 && selected && <div className="flex items-center gap-1" role="group" aria-label={`Antal ${label}`}>
                                            <Button type="button" variant="outline" size="icon" className="h-10 w-10" aria-label={`Færre ${label}`} onClick={() => handleToppingQuantity(topping, selectedQuantity - 1)}><Minus className="h-4 w-4" /></Button>
                                            <output className="w-6 text-center tabular-nums" aria-label={`Valgt antal ${label}`}>{selectedQuantity}</output>
                                            <Button type="button" variant="outline" size="icon" className="h-10 w-10" aria-label={`Flere ${label}`} disabled={selectedQuantity >= topping.maxQuantity || !groupRemaining || !totalRemaining} onClick={() => handleToppingQuantity(topping, selectedQuantity + 1)}><Plus className="h-4 w-4" /></Button>
                                          </div>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </section>
                              );
                            })}
                        </>
                    )}
                  {combos.filter(c => c.upgradeProductIds?.includes(product.id) && c.productGroups.some(g => g.productIds.includes(product.id))).slice(0,2).map(c => {
                    const price = deliveryType === 'delivery' ? c.deliveryPrice : c.pickupPrice;
                    if (price === undefined) return null;
                    const delta=price-finalPrice-toppingsTotal;
                    return <section className="commerce-inline-offers" key={c.id}>
                      <h3 className="font-semibold">Gør det til {c.comboName}</h3><p className="text-sm">{c.description || c.productGroups.map(g=>g.groupName).join(' + ')}</p>
                      <p className="text-sm">{formatPrice(price)} pr. menu · {delta>=0?`+${formatPrice(delta)}`:`Spar ${formatPrice(-delta)}`} pr. stk.</p>
                      {Object.keys(selectedToppings).length>0 && <p className="text-xs">Menuen har egne tilvalg. Dine produkttilvalg følger ikke med.</p>}
                      <Button className="mt-2 w-full" onClick={() => setUpgrade(c)}>Vælg menu</Button>
                    </section>;
                  })}
                </div>
            </ScrollArea>
             <div className="w-full mt-auto sticky bottom-0">
                <div className="commerce-option-quantity flex items-center justify-center gap-3 p-3 bg-[#FFF8F0] border-t">
                    <Button
                        variant="outline"
                        aria-label="Reducer antal" onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        className="w-11 h-11 rounded-lg bg-gray-200 text-gray-800 flex items-center justify-center transition-all hover:bg-gray-300"
                    >
                        <Minus className="h-6 w-6" />
                    </Button>
                    <span className="text-2xl font-bold w-12 text-center">{quantity}</span>
                    <Button
                        variant="outline"
                        aria-label="Øg antal" disabled={quantity >= 100} onClick={() => setQuantity(q => Math.min(100,q + 1))}
                        className="w-11 h-11 rounded-lg bg-gray-200 text-gray-800 flex items-center justify-center transition-all hover:bg-gray-300"
                    >
                        <Plus className="h-6 w-6" />
                    </Button>
                </div>
                <Button
                    size="lg"
                    className="w-full h-[64.4px] bg-m3-orange hover:bg-m3-orange/90 text-m3-dark font-bold text-base px-6 rounded-none"
                    onClick={handleAddToCart}
                    disabled={!cartReady}
                >
                    <div className="flex w-full justify-between items-center">
                        <span>{!isSelectionValid ? 'Vælg de påkrævede tilvalg' : initialItem ? 'Gem ændringer' : 'Tilføj til kurv'}</span>
                        <span>{formatPrice(totalItemPrice)}</span>
                    </div>
                </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
