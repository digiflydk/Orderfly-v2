
'use client';
import { money } from '@/lib/money';

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
import type { CartItem, ComboMenu, Product, ComboSelection, ProductForMenu } from '@/types';
import { Minus, Plus, X } from 'lucide-react';
import Image from 'next/image';
import { Badge } from '../ui/badge';
import {formatPrice} from '@/lib/storefront-format';
import {safeImage} from '@/lib/images';

interface ComboBuilderDialogProps {
  combo: ComboMenu;
  initialItem?: CartItem;
  initialQuantity?: number;
  preselectedProductId?: string;
  onSaved?: () => void;
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

export function ComboBuilderDialog({ combo, isOpen, setIsOpen, brandProducts, initialItem, initialQuantity, preselectedProductId, onSaved }: ComboBuilderDialogProps) {
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

  const comboPrice = useMemo(() => {
    const amount = deliveryType === 'delivery' ? combo.deliveryPrice : combo.pickupPrice;
    return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? money(amount) : undefined;
  }, [deliveryType, combo]);

  useEffect(() => {
    if (!isOpen) {initialized.current = ''; return;}
    const key = `${combo.id}/${location?.id}/${deliveryType}`;
    if (initialized.current && initialized.current !== key) {setIsOpen(false); return;}
    if (isOpen && initialized.current !== key) {
      initialized.current = key; committed.current = false; setShowErrors(false);
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
      setSelection(initialSelection);
      setQuantity(initialQuantity || initialItem?.quantity || 1);
    }
  }, [isOpen, combo, location?.id, deliveryType, initialItem, initialQuantity, preselectedProductId, brandProducts, setIsOpen]);

  function handleSelectionChange(groupId: string, productId: string, multi: boolean, checked?: boolean) {
    const group = combo.productGroups.find(g => g.id === groupId);
    if (!group) return;

    const max = Number(group.maxSelection);

    setSelection(prev => {
      const current = prev[groupId] || [];
      if (multi) {
        let newSelection;
        if (checked) {
          newSelection = [...current, productId];
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

  const handleAddToCart = () => {
    if (!cartReady || committed.current || comboPrice === undefined) return;
    if (!isSelectionValid) {
      setShowErrors(true);
      const group = combo.productGroups.find(g => {
        const ids = selection[g.id] || [];
        return ids.length < Number(g.minSelection) || (Number(g.maxSelection)>0 && ids.length>Number(g.maxSelection)) || ids.some(id => !brandProducts.some(p=>p.id===id));
      });
      const el = group && document.getElementById(`${dialogId}-group-${group.id}`);
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
          return { id: pid, name: product?.productName || 'Vare' };
        })
      };
    });
    if (addComboToCart(combo, quantity, comboSelections, comboPrice, initialItem) === false) {toast({variant:'destructive',title:'Kurven blev ændret',description:'Luk tilvalg og åbn varen igen.'}); return;}
    committed.current = true;
    onSaved?.();
    toast({title: initialItem ? 'Kurven er opdateret' : 'Tilføjet til kurven', description: `${quantity} × ${combo.comboName}`, duration: 2200});
    trackEvent('add_to_cart', {productId: combo.id, locationId: location?.id, itemsCount: quantity, cartValue: money(comboPrice * quantity), deliveryType});
    setIsOpen(false);
  };
  
  const totalItemPrice = (comboPrice || 0) * quantity;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent data-commerce-panel="options" className="p-0 flex flex-col h-full sm:max-h-[90vh] max-w-lg bg-[#FFF8F0]">
        <div className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
                <div className="commerce-option-header">
                  <div className="commerce-option-image"><Image src={safeImage(combo.imageUrl)} alt="" fill sizes="88px" className="rounded-lg object-cover" /></div>
                  <DialogHeader className="text-left pr-6"><DialogTitle className="text-xl">{combo.comboName}</DialogTitle><DialogDescription>{combo.description || 'Sammensæt din menu.'}</DialogDescription><p className="font-semibold">{formatPrice(comboPrice || 0)}</p></DialogHeader>
                </div>
                <div className="p-4 space-y-3">
                    {[...combo.productGroups].sort((a,b)=>Number(Number(b.minSelection)>0)-Number(Number(a.minSelection)>0)).map(group => {
                    const productsInGroup = group.productIds
                        .map(pid => brandProducts.find(p => p.id === pid))
                        .filter(Boolean) as ProductForMenu[];

                    const isSingleSelect = Number(group.maxSelection) === 1;
                    const currentSelection = selection[group.id] || [];

                    return (
                        <section key={group.id} id={`${dialogId}-group-${group.id}`} aria-labelledby={`${dialogId}-heading-${group.id}`} tabIndex={-1} className="commerce-option-group" data-invalid={showErrors && currentSelection.length < Number(group.minSelection)}>
                        <div className="mb-1">
                            <h3 id={`${dialogId}-heading-${group.id}`} className="font-semibold text-lg">{group.groupName}</h3>
                            <p className="text-sm text-muted-foreground">{Number(group.minSelection)>0 ? 'Påkrævet' : 'Valgfrit'} · {getSelectionText(group)}</p>
                        </div>
                        <div className="space-y-0">
                        {isSingleSelect ? (
                            <RadioGroup className="gap-0" value={currentSelection[0]} onValueChange={(val) => handleSelectionChange(group.id, val, false)}>
                                {productsInGroup.map(p => (
                                <label htmlFor={`${dialogId}-${group.id}-${p.id}`} key={p.id} data-option-row className="flex items-center gap-3 min-h-11 px-2 py-1 rounded-md hover:bg-accent cursor-pointer">
                                    <RadioGroupItem value={p.id} id={`${dialogId}-${group.id}-${p.id}`} />
                                    <Image src={safeImage(p.imageUrl)} alt="" width={36} height={36} className="rounded object-cover h-9 w-9"/><span className="flex-1 font-normal">{p.productName}</span>
                                </label>
                                ))}
                            </RadioGroup>
                        ) : (
                            productsInGroup.map(p => {
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
                                <Image src={safeImage(p.imageUrl)} alt="" width={36} height={36} className="rounded object-cover h-9 w-9"/><span className="flex-1 font-normal">{p.productName}</span>
                                </label>
                            )
                            })
                        )}
                        </div>
                        </section>
                    );
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
                    disabled={!cartReady || comboPrice === undefined}
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
