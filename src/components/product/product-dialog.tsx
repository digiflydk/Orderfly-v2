
'use client';
import { lineMoney, money, sumMoney } from '@/lib/money';
import { activeToppingGroupIds } from '@/lib/topping-conditions';
import { resolveToppingOptions, cartTopping, toppingSelectionError, reconcileToppingQuantities, type EffectiveTopping } from '@/lib/topping-options';
import { orderPresentedOptions } from '@/lib/option-presentation';
import { MAX_TOPPINGS_PER_ITEM } from '@/lib/commerce-limits';

import { useState, useMemo, useEffect, useRef, useId } from 'react';
import Image from 'next/image';
import { Minus, Plus } from 'lucide-react';
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
import { ProductOptionGroup } from './product-option-group';
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
  upsellId?: string;
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


export function ProductDialog({ product, isOpen, setIsOpen, allToppingGroups, allToppings, applicableDiscount, initialItem, onAdded, upsellId }: ProductDialogProps) {
  const {combos, products} = useStorefrontCatalog();
  const [upgrade, setUpgrade] = useState<ComboMenu | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const initialized = useRef('');
  const committed = useRef(false);
  const interactionId = useRef('');
  const pendingUserSelection = useRef(false);
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
      toppings: orderPresentedOptions(effectiveOptions.filter(option => option.groupId === group.id)),
    })).filter(group => group.toppings.length > 0 || group.minSelection > 0);
  }, [product.toppingGroupIds, allToppingGroups, effectiveOptions]);

  const relevantToppingGroups = useMemo(() => {
    const active = activeToppingGroupIds(product, configuredToppingGroups, effectiveOptions, Object.keys(selectedToppings));
    return configuredToppingGroups.filter(group => active.has(group.id))
      .sort((a, b) => Number(b.minSelection > 0) - Number(a.minSelection > 0));
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
      interactionId.current = crypto.randomUUID();
      pendingUserSelection.current = false;
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
      if (relevantToppingGroups.length > 0) trackEvent('option_dialog_opened', {productId: product.id, locationId: location.id, interactionId: interactionId.current, interactionMode: initialItem ? 'edit' : 'add'});
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
      const reconciled = reconcileSelection(next, previous);
      if (JSON.stringify(quantities(previous)) !== JSON.stringify(quantities(reconciled))) pendingUserSelection.current = true;
      return reconciled;
    });
  };

  useEffect(() => {
    if (!pendingUserSelection.current) return;
    pendingUserSelection.current = false;
    trackEvent('option_selection_changed', {productId: product.id, locationId: location?.id, interactionId: interactionId.current, interactionMode: initialItem ? 'edit' : 'add'});
  }, [selectedToppings, trackEvent, product.id, location?.id]);

  const toppingsTotal = sumMoney(Object.values(selectedToppings).map(topping => topping.price));
  const totalItemPrice = lineMoney(finalPrice, quantity, [toppingsTotal]);
  const selectionError = toppingSelectionError(product, configuredToppingGroups, effectiveOptions, quantities(selectedToppings), MAX_TOPPINGS_PER_ITEM);
  const isSelectionValid = selectionError === null;
  const requiredGroups = relevantToppingGroups.filter(group => group.minSelection > 0);
  const completedRequiredGroups = requiredGroups.filter(group => {
    const count = group.toppings.reduce((sum, option) => sum + (selectedToppings[option.id]?.quantity ?? 0), 0);
    return count >= group.minSelection && (group.maxSelection === 0 || count <= group.maxSelection);
  }).length;

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
    const saved = addToCart(product, quantity, finalToppings, basePrice, finalPrice, initialItem, upsellId);
    if (saved === false) {toast({variant:'destructive',title:'Kurven blev ændret',description:'Luk tilvalg og åbn varen igen for at fortsætte.'}); return;}
    committed.current = true;
    if (relevantToppingGroups.length > 0) trackEvent('option_product_added', {productId: product.id, locationId: location?.id, interactionId: interactionId.current, interactionMode: initialItem ? 'edit' : 'add'});
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
      <DialogContent data-commerce-panel="options" data-product-options className="p-0 flex flex-col max-w-lg bg-[#FFF8F0]">
        <div className="flex min-h-0 flex-col overflow-hidden">
            <div role="region" aria-label="Produktinformation" tabIndex={0} className="commerce-option-header shrink-0 max-h-[35dvh] overflow-y-auto overscroll-contain">
                  <div className="commerce-option-image"><Image src={safeImage(product.imageUrl)} alt="" fill sizes="88px" className="rounded-lg object-cover" /></div>
                  <DialogHeader className="text-left pr-10"><DialogTitle className="text-xl">{product.productName}</DialogTitle><DialogDescription>{product.description || 'Vælg dine tilvalg her.'}</DialogDescription><p className="font-semibold">{formatPrice(finalPrice)}</p></DialogHeader>
                </div>
            <div data-product-options-scroll className="min-h-0 overflow-y-auto overscroll-contain">
                <div className="px-4 pb-3 pt-2 space-y-2">
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

                            {relevantToppingGroups.map(group => <ProductOptionGroup key={group.id}
                              group={group} initiallyExpanded={group.id === relevantToppingGroups.find(candidate => candidate.minSelection === 0)?.id} dialogId={dialogId} selectedToppings={selectedToppings}
                              showErrors={showErrors} selectionText={getSelectionText(group)} onQuantity={handleToppingQuantity} />)}
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
            </div>
            <div className="commerce-product-footer shrink-0 border-t bg-inherit px-3 py-3">
              {requiredGroups.length > 0 && <p role="status" aria-label="Valgstatus" className={completedRequiredGroups === requiredGroups.length ? "sr-only" : "mb-2 text-xs text-muted-foreground"}>{completedRequiredGroups} af {requiredGroups.length} påkrævede grupper valgt</p>}
              <div className="flex items-center gap-3">
                <div className="commerce-option-quantity flex shrink-0 items-center gap-1" role="group" aria-label="Antal produkter">
                  <Button type="button" variant="outline" size="icon" aria-label="Reducer antal" disabled={quantity <= 1} onClick={() => setQuantity(q => Math.max(1, q - 1))} className="h-11 w-11 rounded-lg"><Minus className="h-4 w-4" /></Button>
                  <span className="w-7 text-center text-lg font-semibold tabular-nums">{quantity}</span>
                  <Button type="button" variant="outline" size="icon" aria-label="Øg antal" disabled={quantity >= 100} onClick={() => setQuantity(q => Math.min(100,q + 1))} className="h-11 w-11 rounded-lg"><Plus className="h-4 w-4" /></Button>
                </div>
                <Button size="lg" className="commerce-product-submit h-auto min-h-12 min-w-0 flex-1 flex-col gap-0 rounded-lg px-2 py-1.5 font-bold"
                  onClick={handleAddToCart} disabled={!cartReady}
                  aria-label={`${!isSelectionValid ? 'Vælg de påkrævede tilvalg' : initialItem ? 'Gem ændringer' : 'Tilføj til kurv'} · I alt ${formatPrice(totalItemPrice)}`}>
                  <span className="text-sm">{!isSelectionValid ? 'Vælg tilvalg' : initialItem ? 'Gem ændringer' : 'Tilføj til kurv'}</span>
                  <span className="text-sm tabular-nums">{formatPrice(totalItemPrice)}</span>
                </Button>
              </div>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
