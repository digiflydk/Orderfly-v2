
'use client';
import { lineMoney, money, sumMoney } from '@/lib/money';
import { activeToppingGroupIds, reconcileToppingIds } from '@/lib/topping-conditions';
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
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
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

  return "Vælg en";
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
  const { trackEvent } = useAnalytics();

  const configuredToppingGroups = useMemo(() => {
    if (!product.toppingGroupIds || !allToppingGroups || !allToppings) return [];

    const productToppingGroupIds = new Set(product.toppingGroupIds);
    const allActiveToppings = allToppings.filter(t => t.isActive);

    return allToppingGroups
        .filter(group => productToppingGroupIds.has(group.id))
        .map(group => ({
            ...group,
            toppings: allActiveToppings
                .filter(topping => topping.groupId === group.id)
                .sort((a,b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
        }))
        .filter(group => group.toppings.length > 0 || Number(group.minSelection) > 0)
        .sort((a,b) => Number(Number(b.minSelection) > 0) - Number(Number(a.minSelection) > 0));
  }, [product.toppingGroupIds, allToppingGroups, allToppings]);

  const relevantToppingGroups = useMemo(() => {
    const active = activeToppingGroupIds(product, configuredToppingGroups, allToppings, Object.keys(selectedToppings));
    return configuredToppingGroups.filter(g => active.has(g.id));
  }, [product, configuredToppingGroups, allToppings, selectedToppings]);

  const reconcileSelection = (selected: Record<string, CartItemTopping>, previous?: Record<string, CartItemTopping>) => {
    const options = configuredToppingGroups.flatMap(g => g.toppings);
    const ids = reconcileToppingIds(product, configuredToppingGroups, options, Object.keys(selected), MAX_TOPPINGS_PER_ITEM, previous === undefined ? undefined : Object.keys(previous));
    return Object.fromEntries(options.filter(t => ids.has(t.id)).map(t => [t.id, {id:t.id, name:t.toppingName, price:money(t.price)}]));
  };

  const finalPrice = product.price;

  useEffect(() => {
    if (!isOpen) {initialized.current = ''; return;}
    const key = `${product.id}/${location?.id}/${deliveryType}/${initialItem?.cartItemId || ''}`;
    if (isOpen && location && initialized.current !== key) {
      if (initialized.current) {setIsOpen(false); return;}
      initialized.current = key; committed.current = false; setShowErrors(false);
      setQuantity(initialItem?.quantity || 1);

      const defaultToppings: Record<string, CartItemTopping> = {};
      configuredToppingGroups.forEach(group => {
          group.toppings.forEach(topping => {
              if (topping.isDefault && Object.keys(defaultToppings).length < MAX_TOPPINGS_PER_ITEM) {
                  defaultToppings[topping.id] = { id: topping.id, name: topping.toppingName, price: money(topping.price) };
              }
          });
      });
      const selected = initialItem ? Object.fromEntries(initialItem.toppings.flatMap(t => {
        const match = configuredToppingGroups.flatMap(g => g.toppings).find(candidate => t.id ? candidate.id === t.id : candidate.toppingName === t.name);
        return match ? [[match.id,{id:match.id,name:match.toppingName,price:money(match.price)}]] : [];
      })) : defaultToppings;
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
    const key = `${product.id}/${location.id}`;
    if (trackedView.current !== key && trackEvent('view_product', {productId: product.id, locationId: location.id})) {
      trackedView.current = key;
    }
  }, [isOpen, product.id, location?.id, trackEvent]);

  const basePrice = useMemo(() => {
    return (product as any).basePrice ?? (deliveryType === 'delivery' ? (product.priceDelivery ?? product.price) : product.price);
  }, [product, deliveryType]);


  const handleToppingChange = (topping: Topping, isChecked: boolean, isSingleSelect: boolean) => {
    setSelectedToppings(prev => {
        const newSelected = { ...prev };

        if (isSingleSelect) {
            const groupToppings = relevantToppingGroups.find(g => g.id === topping.groupId)?.toppings || [];
            groupToppings.forEach(t => {
                delete newSelected[t.id];
            });
            if (isChecked) {
                if (!newSelected[topping.id] && Object.keys(newSelected).length >= MAX_TOPPINGS_PER_ITEM) return prev;
                newSelected[topping.id] = { id: topping.id, name: topping.toppingName, price: money(topping.price) };
            }
        } else {
            if (isChecked) {
                if (!newSelected[topping.id] && Object.keys(newSelected).length >= MAX_TOPPINGS_PER_ITEM) return prev;
                newSelected[topping.id] = { id: topping.id, name: topping.toppingName, price: money(topping.price) };
            } else {
                delete newSelected[topping.id];
            }
        }
        return reconcileSelection(newSelected, prev);
    });
  };

  const toppingsTotal = sumMoney(Object.values(selectedToppings).map(topping => topping.price));
  const totalItemPrice = lineMoney(finalPrice, quantity, [toppingsTotal]);

  const isSelectionValid = useMemo(() => {
    return Object.keys(selectedToppings).length <= MAX_TOPPINGS_PER_ITEM && relevantToppingGroups.every(group => {
        const count = Object.keys(selectedToppings).filter(tid => group.toppings.some(t => t.id === tid)).length;
        const min = Number(group.minSelection);
        const max = Number(group.maxSelection);

        if (count < min) return false;
        if (max > 0 && count > max) return false;

        return true;
    });
}, [selectedToppings, relevantToppingGroups]);

  const handleAddToCart = () => {
    if (!cartReady || committed.current) return;
    if (!isSelectionValid) {
      setShowErrors(true);
      const group = relevantToppingGroups.find(g => {
        const n = g.toppings.filter(t => selectedToppings[t.id]).length;
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
        cartValue: cartTotal + totalItemPrice
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
                                const isSingleSelect = Number(group.maxSelection) === 1;
                                const currentSelection = Object.keys(selectedToppings).filter(tid => group.toppings.some(t => t.id === tid));

                                return (
                                    <section key={group.id} id={`${dialogId}-group-${group.id}`} aria-labelledby={`${dialogId}-heading-${group.id}`} tabIndex={-1} className="commerce-option-group" data-invalid={showErrors && currentSelection.length < Number(group.minSelection)}>
                                        <div className="mb-1">
                                        <h3 id={`${dialogId}-heading-${group.id}`} className="font-semibold text-lg">{group.groupName}</h3>
                                        <p className="text-sm text-muted-foreground">{Number(group.minSelection) > 0 ? 'Påkrævet' : 'Valgfrit'} · {getSelectionText(group)}</p>
                                        </div>
                                        <div className="space-y-0">
                                            {isSingleSelect ? (
                                                <RadioGroup className="gap-0" value={currentSelection[0]} onValueChange={(val) => handleToppingChange(group.toppings.find(t => t.id === val)!, true, true)}>
                                                    {group.toppings.map(topping => (
                                                    <label htmlFor={`${dialogId}-${topping.id}`} key={`${dialogId}-${topping.id}`} data-option-row className="flex items-center justify-between gap-3 min-h-11 px-2 py-1 rounded-md hover:bg-accent cursor-pointer">
                                                        <span className="flex items-center space-x-3">
                                                    <RadioGroupItem
                                                        value={topping.id}
                                                        id={`${dialogId}-${topping.id}`}
                                                        disabled={!currentSelection.length && Object.keys(selectedToppings).length >= MAX_TOPPINGS_PER_ITEM}
                                                    />
                                                            <span className="flex-1 font-normal">{topping.toppingName}</span>
                                                        </span>
                                                        <span className="text-sm text-muted-foreground">+{formatPrice(topping.price)}</span>
                                                    </label>
                                                    ))}
                                                </RadioGroup>
                                            ) : (
                                                group.toppings.map(topping => {
                                                const isChecked = currentSelection.includes(topping.id);
                                                const maxReached = Number(group.maxSelection) > 0 && currentSelection.length >= Number(group.maxSelection);
                                                return (
                                                    <label htmlFor={`${dialogId}-${topping.id}`} key={`${dialogId}-${topping.id}`} data-option-row className="flex items-center justify-between gap-3 min-h-11 px-2 py-1 rounded-md hover:bg-accent cursor-pointer">
                                                        <span className="flex items-center space-x-3">
                                                            <Checkbox
                                                                id={`${dialogId}-${topping.id}`}
                                                                onCheckedChange={(checked) => handleToppingChange(topping, !!checked, false)}
                                                                checked={!!selectedToppings[topping.id]}
                                                                disabled={!selectedToppings[topping.id] && (maxReached || Object.keys(selectedToppings).length >= MAX_TOPPINGS_PER_ITEM)}
                                                            />
                                                            <span className="flex-1 font-normal">
                                                                {topping.toppingName}
                                                            </span>
                                                        </span>
                                                        <span className="text-sm text-muted-foreground">
                                                            +{formatPrice(topping.price)}
                                                        </span>
                                                </label>
                                                )
                                            })
                                            )}
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
