
'use client';
import { useStorefrontV2 } from '@/context/storefront-v2-context';
import { publicRead } from '@/lib/public-read';
import { ProductOptionGroup } from './product-option-group';
import { activeToppingGroupIds } from '@/lib/topping-conditions';
import { resolveToppingOptions, reconcileToppingQuantities, cartTopping, type EffectiveTopping } from '@/lib/topping-options';
import { resolveComboProductModifiers } from '@/lib/combo-modifiers';
import { money, sumMoney } from '@/lib/money';
import { comboProductAdjustment, comboSelectionAdjustments } from '@/lib/combo-pricing';

import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useCart } from '@/context/cart-context';
import { useAnalytics } from '@/context/analytics-context';
import { useToast } from '@/hooks/use-toast';
import type { CartItem, ComboMenu, Product, ComboSelection, ProductForMenu, Topping, ToppingGroup } from '@/types';
import { Minus, Plus, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { Badge } from '../ui/badge';
import {formatPrice} from '@/lib/storefront-format';
import {safeImage} from '@/lib/images';

interface ComboBuilderDialogProps {
  combo: ComboMenu;
  initialItem?: CartItem;
  initialQuantity?: number;
  preselectedProductId?: string;
  preselectedModifiers?: {id: string; quantity: number}[];
  onSaved?: () => void;
  onBack?: () => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  brandProducts: ProductForMenu[];
}

interface SelectionState {
  [groupId: string]: string[];
}

const getSelectionText = (group: ComboMenu['productGroups'][0]): string => {
    const min = Number(group.minSelection);
    const max = Number(group.maxSelection);

    if (max > 0 && min === max && min > 1) return `Vælg præcis ${min}`;
    if (min > 0 && max > 0 && min !== max) return `Vælg ${min} til ${max}`;
    if (min > 0 && max === 0) return `Vælg mindst ${min}`;
    if (max > 1 && min <= 1) return `Vælg op til ${max}`;
    
    // For single select radio buttons, we don't need the helper text
    if (max === 1) return min > 0 ? 'Vælg 1' : 'Vælg op til 1';

    return "Vælg tilvalg";
}

export function ComboBuilderDialog({ combo, isOpen, setIsOpen, brandProducts, initialItem, initialQuantity, preselectedProductId, preselectedModifiers, onSaved, onBack }: ComboBuilderDialogProps) {
  const isV2 = useStorefrontV2();
  const retainedGroupId = isV2 && preselectedProductId ? combo.productGroups.find(group => group.productIds.includes(preselectedProductId))?.id : undefined;
  const retainedProduct = retainedGroupId && preselectedProductId ? brandProducts.find(product => product.id === preselectedProductId) : undefined;
  const configureProducts = isV2 || preselectedModifiers !== undefined || !!initialItem?.comboSelections?.some(g => g.products.some(p => p.modifiers !== undefined));
  const { cartReady, addComboToCart, deliveryType, location } = useCart();
  const { trackEvent, measurementKey } = useAnalytics();
  const { toast } = useToast();

  const trackedView = useRef('');
  useEffect(() => {
    if (!isOpen) { trackedView.current = ''; return; }
    if (!location) return;
    const key = `${combo.id}/${location.id}/${measurementKey}`;
    if (trackedView.current !== key && trackEvent('view_product', {productId: combo.id, locationId: location.id})) {
      trackedView.current = key;
    }
  }, [isOpen, combo.id, location?.id, trackEvent, measurementKey]);

  const initialized = useRef('');
  const committed = useRef(false);
  const dialogId = useId();
  const [showErrors, setShowErrors] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selection, setSelection] = useState<SelectionState>({});
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});

  const [modifiers, setModifiers] = useState<Record<string, {id: string; quantity: number}[]>>({});
  const [optionCatalog, setOptionCatalog] = useState<{key: string; groups: ToppingGroup[]; toppings: Topping[]} | null>(null);
  const [optionError, setOptionError] = useState(false);
  const [retry, setRetry] = useState(0);
  const optionKey = `${combo.brandId}/${location?.id}`;
  useEffect(() => {
    if (!isOpen || !location) return;
    let cancelled = false;
    setOptionError(false);
    const needsOptions = configureProducts && combo.productGroups.some(g => brandProducts.some(p => g.productIds.includes(p.id) && p.toppingGroupIds?.length));
    const read = needsOptions ? publicRead<{groups: ToppingGroup[]; toppings: Topping[]}>(`/api/public/product-options?${new URLSearchParams({brandId: combo.brandId, locationId: location.id})}`) : Promise.resolve({groups: [], toppings: []});
    read
      .then(data => { if (!Array.isArray(data.groups) || !Array.isArray(data.toppings)) throw Error('Invalid options'); if (!cancelled) setOptionCatalog({...data, key: optionKey}); })
      .catch(() => {if (!cancelled) setOptionError(true);});
    return () => {cancelled = true;};
  }, [isOpen, optionKey, retry, configureProducts]);
  const optionsReady = optionCatalog?.key === optionKey && !optionError;
  const configurations = combo.productGroups.flatMap(group => (selection[group.id] || []).flatMap(id => {
    const product = brandProducts.find(p => p.id === id);
    if (!configureProducts || !product || !location || !deliveryType || !optionsReady) return [];
    const key = `${group.id}/${id}`;
    const catalog = {...optionCatalog!, products: brandProducts};
    const scope = {brandId: combo.brandId, locationId: location.id, deliveryType};
    const groups = catalog.groups.filter(g => product.toppingGroupIds?.includes(g.id));
    const options = resolveToppingOptions(product, groups, catalog.toppings, brandProducts, scope);
    const choices = modifiers[key] ?? Object.entries(reconcileToppingQuantities(product, groups, options, {})).map(([id,quantity]) => ({id,quantity}));
    const quantities = Object.fromEntries(choices.map(m => [m.id,m.quantity]));
    const resolved = resolveComboProductModifiers(product, choices, catalog, scope);
    return [{key, product, groups, options, choices, quantities, resolved}];
  }));
  const modifierToppings = configurations.flatMap(c => (c.resolved || []).map(t => ({...t, name: `${c.product.productName}: ${t.name}`})));
  const modifierTotal = sumMoney(modifierToppings.map(t => t.price));
  function updateModifier(config: typeof configurations[number], option: EffectiveTopping, count: number) {
    const next = {...config.quantities};
    const group = config.groups.find(g => g.id === option.groupId);
    if (count > 0 && (group?.selectionMode === 'single' || group?.maxSelection === 1)) config.options.filter(o => o.groupId === option.groupId).forEach(o => delete next[o.id]);
    if (count > 0) next[option.id] = count; else delete next[option.id];
    const reconciled = reconcileToppingQuantities(config.product, config.groups, config.options, next, undefined, config.quantities);
    setModifiers(previous => ({...previous, [config.key]: Object.entries(reconciled).map(([id, quantity]) => ({id, quantity}))}));
  }

  const comboPrice = useMemo(() => {
    const amount = deliveryType === 'delivery' ? combo.deliveryPrice : combo.pickupPrice;
    return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? money(amount) : undefined;
  }, [deliveryType, combo]);

  useEffect(() => {
    if (!isOpen) {initialized.current = ''; return;}
    const key = `${combo.id}/${location?.id}/${deliveryType}`;
    if (initialized.current && initialized.current !== key) {setIsOpen(false); return;}
    if (isOpen && initialized.current !== key) {
      initialized.current = key; committed.current = false; setShowErrors(false); setExpandedProducts({});
      const initialSelection: SelectionState = {};
      combo.productGroups.forEach(group => {
        if (Number(group.minSelection)>0 && Number(group.maxSelection)===1 && group.productIds.filter(id=>brandProducts.some(p=>p.id===id)).length===1) {
          initialSelection[group.id] = group.productIds.filter(id => brandProducts.some(p => p.id === id)).slice(0, 1);
        } else {
          initialSelection[group.id] = [];
        }
      });
      if (initialItem?.itemType === 'combo') initialItem.comboSelections?.forEach(g => {
        const group = combo.productGroups.find(candidate => g.groupId ? candidate.id === g.groupId : candidate.groupName === g.groupName);
        if (group) initialSelection[group.id] = g.products.map(p => p.id);
      });
      if (preselectedProductId) {
        const group = combo.productGroups.find(g => g.productIds.includes(preselectedProductId));
        if (group) initialSelection[group.id] = [preselectedProductId];
      }
      const initialModifiers: typeof modifiers = {};
      if (initialItem?.itemType === 'combo') initialItem.comboSelections?.forEach(g => {
        const group = combo.productGroups.find(candidate => g.groupId ? candidate.id === g.groupId : candidate.groupName === g.groupName);
        if (group) g.products.forEach(p => {initialModifiers[`${group.id}/${p.id}`] = p.modifiers || [];});
      });
      if (preselectedProductId) {
        const group = combo.productGroups.find(g => g.productIds.includes(preselectedProductId));
        if (group) initialModifiers[`${group.id}/${preselectedProductId}`] = preselectedModifiers || [];
      }
      setModifiers(initialModifiers);
      setSelection(initialSelection);
      setQuantity(initialQuantity || initialItem?.quantity || 1);
    }
  }, [isOpen, combo, location?.id, deliveryType, initialItem, initialQuantity, preselectedProductId, brandProducts, setIsOpen]);

  function handleSelectionChange(groupId: string, productId: string, multi: boolean, checked?: boolean) {
    const group = combo.productGroups.find(g => g.id === groupId);
    if (!group) return;
    // A dish-origin upgrade keeps that dish; only remaining combo choices may change.
    if (group.id === retainedGroupId && (Number(group.maxSelection) === 1 || productId === preselectedProductId)) return;

    const max = Number(group.maxSelection);

    setSelection(prev => {
      const current = prev[groupId] || [];
      if (multi) {
        let newSelection;
        if (checked) {
          newSelection = Array.from(new Set([...current, productId]));
        } else {
          newSelection = current.filter(id => id !== productId);
        }

        if (max > 0 && newSelection.length > max) {
            toast({
                variant: 'destructive',
                title: 'Maksimum er nået',
                description: `Du kan højst vælge ${max} varer i denne gruppe.`,
            });
            return prev;
        }
        return { ...prev, [groupId]: newSelection };
      } else {
        return { ...prev, [groupId]: [productId] };
      }
    });
  }

  const isSelectionValid = useMemo(() => {
    return combo.productGroups.every(group => {
      const count = selection[group.id]?.length || 0;
      const min = Number(group.minSelection);
      const max = Number(group.maxSelection);

      if ((selection[group.id] || []).some(id => !group.productIds.includes(id) || !brandProducts.some(p => p.id === id))) return false;
      if (count < min) return false;
      if (max > 0 && count > max) return false;
      
      return true;
    });
  }, [selection, combo.productGroups, brandProducts]);

  const selectionAdjustments = comboSelectionAdjustments(combo, Object.entries(selection).map(([groupId, ids]) => ({
    groupId, groupName: combo.productGroups.find(g => g.id === groupId)?.groupName || '',
    products: ids.map(id => ({id, name: ''})),
  })));
  const selectedComboPrice = comboPrice === undefined ? undefined : sumMoney([comboPrice, selectionAdjustments]);

  const handleAddToCart = () => {
    if (!cartReady || committed.current || selectedComboPrice === undefined) return;
    if (!isSelectionValid || !optionsReady || configurations.some(c => !c.resolved)) {
      setShowErrors(true);
      const group = combo.productGroups.find(g => {
        const ids = selection[g.id] || [];
        return ids.length < Number(g.minSelection) || (Number(g.maxSelection)>0 && ids.length>Number(g.maxSelection)) || ids.some(id => !brandProducts.some(p=>p.id===id));
      });
      const invalidProduct = configurations.find(c => !c.resolved);
      if (invalidProduct) setExpandedProducts(previous => ({...previous, [invalidProduct.key]: true}));
      const el = group ? document.getElementById(`${dialogId}-group-${group.id}`) : invalidProduct ? document.getElementById(`${dialogId}-product-${invalidProduct.key}`) : null;
      if (el) {el.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}); el.focus();}
      return;
    }
    const comboSelections: ComboSelection[] = Object.entries(selection).map(([groupId, ids]) => {
      const group = combo.productGroups.find(g => g.id === groupId);
      return {
        groupId,
        groupName: group?.groupName || '',
        products: ids.map(pid => {
          const product = brandProducts.find(p => p.id === pid);
          const choices = configurations.find(c => c.key === `${groupId}/${pid}`)?.choices;
          return { id: pid, name: product?.productName || 'Vare', ...(configureProducts ? {modifiers: choices || []} : {}) };
        })
      };
    });
    if (addComboToCart(combo, quantity, comboSelections, selectedComboPrice, initialItem, modifierToppings) === false) {toast({variant:'destructive',title:'Kurven blev ændret',description:'Luk tilvalg og åbn varen igen.'}); return;}
    committed.current = true;
    onSaved?.();
    toast({title: initialItem ? 'Kurven er opdateret' : 'Tilføjet til kurven', description: `${quantity} × ${combo.comboName}`, duration: 2200});
    trackEvent('add_to_cart', {productId: combo.id, locationId: location?.id, itemsCount: quantity, cartValue: money((selectedComboPrice + modifierTotal) * quantity), deliveryType});
    setIsOpen(false);
  };
  
  const totalItemPrice = sumMoney([selectedComboPrice || 0, modifierTotal]) * quantity;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent data-storefront-version={isV2 ? "2" : undefined} data-commerce-panel="options" className="p-0 flex flex-col h-full sm:max-h-[90vh] max-w-lg bg-[#FFF8F0]">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {isV2 && <div className="v2-product-topbar">
              <Button type="button" variant="ghost" size="icon" aria-label={onBack ? 'Tilbage til retten' : 'Tilbage til menu'} onClick={() => onBack ? onBack() : setIsOpen(false)}><ArrowLeft aria-hidden="true" className="h-5 w-5" /></Button>
              <span>SAMMENSÆT DIN MENU</span>
            </div>}
            <ScrollArea className="flex-1">
                <div className="commerce-option-header">
                  <div className="commerce-option-image"><Image src={safeImage(retainedProduct ? retainedProduct.imageUrl : combo.imageUrl)} alt="" fill sizes="88px" className="rounded-lg object-cover" /></div>
                  <DialogHeader className="text-left pr-6"><DialogTitle className="text-xl">{retainedProduct ? `${retainedProduct.productName}-menu` : combo.comboName}</DialogTitle><DialogDescription>{retainedProduct ? 'Vælg resten af din menu. Dine tilpasninger følger med.' : combo.description || 'Sammensæt din menu.'}</DialogDescription>{retainedProduct && retainedGroupId && comboProductAdjustment(combo.productGroups.find(g => g.id === retainedGroupId)!, retainedProduct.id) > 0 && <p className="text-sm">+{formatPrice(comboProductAdjustment(combo.productGroups.find(g => g.id === retainedGroupId)!, retainedProduct.id))}</p>}{!isV2 && <p className="font-semibold">{formatPrice(comboPrice || 0)}</p>}</DialogHeader>
                </div>
                <div className="p-4 space-y-3">
                    {[...combo.productGroups].sort((a,b)=>Number(Number(b.minSelection)>0)-Number(Number(a.minSelection)>0)).map(group => {
                    const productsInGroup = group.productIds
                        .map(pid => brandProducts.find(p => p.id === pid))
                        .filter(Boolean) as ProductForMenu[];

                    const isSingleSelect = Number(group.maxSelection) === 1;
                    const currentSelection = selection[group.id] || [];
                    const retainsDish = group.id === retainedGroupId && !!retainedProduct;
                    // The retained dish already has its name and image in the dialog header.
                    if (retainsDish && isSingleSelect) return null;

                    return (
                        <section key={group.id} id={`${dialogId}-group-${group.id}`} aria-labelledby={`${dialogId}-heading-${group.id}`} tabIndex={-1} className="commerce-option-group" data-invalid={showErrors && currentSelection.length < Number(group.minSelection)}>
                        <div className="mb-1">
                            <h3 id={`${dialogId}-heading-${group.id}`} className="font-semibold text-lg">{group.groupName}</h3>
                            {!retainsDish && <p className="text-sm text-muted-foreground">{Number(group.minSelection)>0 ? 'Påkrævet' : 'Valgfrit'} · {getSelectionText(group)}</p>}
                        </div>
                        {showErrors && currentSelection.length < Number(group.minSelection) && <p role="alert" className="text-sm text-destructive">{getSelectionText(group)} fra {group.groupName}.</p>}
                        {retainsDish && <div data-retained-combo-product className="flex items-center gap-3 rounded-md border p-3">
                          <Image src={safeImage(retainedProduct.imageUrl)} alt="" width={56} height={56} className="h-14 w-14 rounded object-cover" />
                          <div className="min-w-0 flex-1"><p className="text-sm text-muted-foreground">Din valgte ret</p><p className="font-semibold">{retainedProduct.productName}</p><p className="text-sm text-muted-foreground">Dine tilpasninger følger med.</p></div>
                          {comboProductAdjustment(group,retainedProduct.id)>0 && <span className="text-sm whitespace-nowrap">+{formatPrice(comboProductAdjustment(group,retainedProduct.id))}</span>}
                        </div>}
                        {!(retainsDish && isSingleSelect) && <div className="space-y-0">
                        {retainsDish && <p className="mt-3 text-sm text-muted-foreground">Vælg resten til {group.groupName}. Din valgte ret tæller med.</p>}
                        {isSingleSelect ? (
                            <RadioGroup className="gap-0" value={currentSelection[0] || (Number(group.minSelection)===0 ? '__none' : '')} onValueChange={(val) => val === '__none' ? setSelection(previous => ({...previous,[group.id]:[]})) : handleSelectionChange(group.id, val, false)}>
                                {productsInGroup.map(p => (
                                <label htmlFor={`${dialogId}-${group.id}-${p.id}`} key={p.id} data-option-row className="flex items-center gap-3 min-h-11 px-2 py-1 rounded-md hover:bg-accent cursor-pointer">
                                    <RadioGroupItem value={p.id} id={`${dialogId}-${group.id}-${p.id}`} />
                                    <Image src={safeImage(p.imageUrl)} alt="" width={36} height={36} className="rounded object-cover h-9 w-9"/><span className="flex-1 font-normal">{p.productName}</span>{comboProductAdjustment(group,p.id)>0 && <span className="text-sm whitespace-nowrap">+{formatPrice(comboProductAdjustment(group,p.id))}</span>}
                                </label>
                                ))}
                            {Number(group.minSelection)===0 && <label className="flex items-center gap-3 min-h-11 px-2 cursor-pointer"><RadioGroupItem value="__none" />Ingen tak</label>}
                            </RadioGroup>
                        ) : (
                            productsInGroup.filter(p => !retainsDish || p.id !== preselectedProductId).map(p => {
                            const isChecked = currentSelection.includes(p.id);
                            const maxReached = Number(group.maxSelection) > 0 && currentSelection.length >= Number(group.maxSelection);
                            return (
                                <label htmlFor={`${dialogId}-${group.id}-${p.id}`} key={p.id} data-option-row className="flex items-center gap-3 min-h-11 px-2 py-1 rounded-md hover:bg-accent cursor-pointer">
                                <Checkbox
                                    id={`${dialogId}-${group.id}-${p.id}`}
                                    onCheckedChange={(checked) => handleSelectionChange(group.id, p.id, true, !!checked)}
                                    checked={isChecked}
                                    disabled={!isChecked && maxReached}
                                />
                                <Image src={safeImage(p.imageUrl)} alt="" width={36} height={36} className="rounded object-cover h-9 w-9"/><span className="flex-1 font-normal">{p.productName}</span>{comboProductAdjustment(group,p.id)>0 && <span className="text-sm whitespace-nowrap">+{formatPrice(comboProductAdjustment(group,p.id))}</span>}
                                </label>
                            )
                            })
                        )}
                        </div>}
                        </section>
                    );
                    })}
                    {!optionsReady && <p role="status">{optionError ? 'Tilvalg kunne ikke indlæses.' : 'Indlæser tilvalg…'}</p>}
                    {optionError && <Button onClick={() => setRetry(n => n + 1)}>Prøv igen</Button>}
                    {configurations.filter(c => c.groups.length > 0).map(config => {
                      const active = activeToppingGroupIds(config.product, config.groups, config.options, Object.keys(config.quantities));
                      // The approved Esmeralda pizza menu already includes a drink. This catalog
                      // group contains larger extra drinks, not dish customizations. Scope this
                      // presentation policy to that menu; never guess by translated group labels.
                      const visibleGroups = config.groups.filter(group => {
                        if (!active.has(group.id)) return false;
                        const selected = config.options.some(option => option.groupId === group.id && (config.quantities[option.id] || 0) > 0);
                        const excludedDrinkUpsell = isV2 && combo.brandId === 'oeypKaMyYcQjIwaa1PtV'
                          && combo.id === 'esmeralda-v2-pizzamenu-20261030' && group.id === 'D7lnGx57JS0BnSFqSzHn';
                        // Keep required rules reachable, and preserve/edit existing paid extras.
                        return !excludedDrinkUpsell || Number(group.minSelection) > 0 || selected;
                      });
                      const selectedToppings = Object.fromEntries(config.choices.flatMap(m => {
                        const option = config.options.find(o => o.id === m.id);
                        return option && m.quantity <= option.maxQuantity ? [[m.id, cartTopping(option,m.quantity)]] : [];
                      }));
                      return <section key={config.key} id={`${dialogId}-product-${config.key}`} tabIndex={-1} aria-label={`Tilvalg til ${config.product.productName}`}>
                        {isV2 ? <Button type="button" variant="outline" aria-expanded={!!expandedProducts[config.key]} aria-controls={`${dialogId}-options-${config.key}`} onClick={() => setExpandedProducts(previous => ({...previous, [config.key]: !previous[config.key]}))}>{expandedProducts[config.key] ? 'Luk tilpasning' : 'Tilpas'}{config.product.id !== retainedProduct?.id ? ` ${config.product.productName}` : ''}</Button> : <h3 className="font-semibold">Tilvalg til {config.product.productName}</h3>}
                        {isV2 && config.resolved && config.resolved.length > 0 && <p className="mt-2 text-sm text-muted-foreground">{config.resolved.map(t => t.name).join(', ')}</p>}
                        {showErrors && !config.resolved && <p role="alert">Kontrollér tilvalg til {config.product.productName}.</p>}
                        <div id={`${dialogId}-options-${config.key}`} hidden={isV2 && !expandedProducts[config.key]}>
                        {visibleGroups.map(group => <ProductOptionGroup key={group.id}
                          group={{...group, toppings:config.options.filter(o => o.groupId === group.id)}}
                          dialogId={`${dialogId}-${config.key}`} selectedToppings={selectedToppings} showErrors={showErrors}
                          initiallyExpanded selectionText={group.maxSelection === group.minSelection ? `Vælg ${group.minSelection}` : `Vælg mindst ${group.minSelection}`}
                          onQuantity={(option, count) => updateModifier(config,option,count)} />)}
                        </div>
                      </section>;
                    })}
            </div>
            </ScrollArea>
            <div className="commerce-combo-footer w-full shrink-0 mt-auto sticky bottom-0">
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
                        aria-label="Øg antal" disabled={quantity>=100} onClick={() => setQuantity(q => Math.min(100,q + 1))}
                        className="w-11 h-11 rounded-lg bg-gray-200 text-gray-800 flex items-center justify-center transition-all hover:bg-gray-300"
                    >
                        <Plus className="h-6 w-6" />
                    </Button>
                </div>
                <Button
                    size="lg"
                    className="w-full h-[64.4px] bg-m3-orange hover:bg-m3-orange/90 text-m3-dark font-bold text-base px-6 rounded-none"
                    onClick={handleAddToCart}
                    disabled={!cartReady || comboPrice === undefined || !optionsReady}
                >
                    <div className="flex w-full justify-between items-center gap-3">
                        <span>{!isSelectionValid || configurations.some(c => !c.resolved) ? (isV2 ? 'Vælg tilvalg' : 'Vælg de påkrævede tilvalg') : initialItem ? 'Gem ændringer' : 'Tilføj til kurv'}</span>
                        <span>{formatPrice(totalItemPrice)}</span>
                    </div>
                </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
