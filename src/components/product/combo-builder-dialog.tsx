
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import type { ComboMenu, Product, ComboSelection, ProductForMenu } from '@/types';
import { Minus, Plus, X } from 'lucide-react';
import { Separator } from '../ui/separator';
import Image from 'next/image';
import { Badge } from '../ui/badge';

interface ComboBuilderDialogProps {
  combo: ComboMenu;
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
    if (max === 1) return '';

    return "Vælg option(s)";
}

export function ComboBuilderDialog({ combo, isOpen, setIsOpen, brandProducts }: ComboBuilderDialogProps) {
  const { addComboToCart, deliveryType } = useCart();
  const { toast } = useToast();

  const [quantity, setQuantity] = useState(1);
  const [selection, setSelection] = useState<SelectionState>({});

  const comboPrice = useMemo(() => {
    return deliveryType === 'delivery' ? combo.deliveryPrice : combo.pickupPrice;
  }, [deliveryType, combo]);

  useEffect(() => {
    if (isOpen) {
      const initialSelection: SelectionState = {};
      combo.productGroups.forEach(group => {
        if (Number(group.maxSelection) === 1 && group.productIds.length > 0) {
          initialSelection[group.id] = [group.productIds[0]];
        } else {
          initialSelection[group.id] = [];
        }
      });
      setSelection(initialSelection);
      setQuantity(1);
    }
  }, [isOpen, combo]);

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
                title: 'Selection Limit Reached',
                description: `You can only select up to ${max} items for this group.`,
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

      if (count < min) return false;
      if (max > 0 && count > max) return false;
      
      return true;
    });
  }, [selection, combo.productGroups]);

  const handleAddToCart = () => {
    if (!isSelectionValid || comboPrice === undefined) return;
    const comboSelections: ComboSelection[] = Object.entries(selection).map(([groupId, ids]) => {
      const group = combo.productGroups.find(g => g.id === groupId);
      return {
        groupName: group?.groupName || '',
        products: ids.map(pid => {
          const product = brandProducts.find(p => p.id === pid);
          return { id: pid, name: product?.productName || 'Unknown' };
        })
      };
    });
    addComboToCart(combo, quantity, comboSelections, comboPrice);
    setIsOpen(false);
  };
  
  const totalItemPrice = (comboPrice || 0) * quantity;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="p-0 flex flex-col h-full sm:max-h-[90vh] max-w-lg bg-[#FFF8F0]">
         <ScrollArea className="flex-1">
            <div className="relative aspect-video w-full shrink-0">
                <Image 
                    src={combo.imageUrl || 'https://placehold.co/400x300.png'} 
                    alt={combo.comboName}
                    fill
                    sizes="(max-width: 640px) 100vw, 512px"
                    className="object-cover"
                    data-ai-hint="delicious food"
                />
                 <DialogClose asChild>
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-black/30 hover:bg-black/50 text-white rounded-full">
                        <X className="h-4 w-4" />
                    </Button>
                </DialogClose>
            </div>
            <div className="p-4 space-y-6">
                <DialogHeader className="text-left space-y-2">
                    <DialogTitle className="text-2xl">{combo.comboName}</DialogTitle>
                    {combo.description && <DialogDescription className="text-base">{combo.description}</DialogDescription>}
                </DialogHeader>
                
            <Separator />
            {combo.productGroups.map(group => {
              const productsInGroup = group.productIds
                .map(pid => brandProducts.find(p => p.id === pid))
                .filter(Boolean) as ProductForMenu[];

              const isSingleSelect = Number(group.maxSelection) === 1;
              const currentSelection = selection[group.id] || [];

              return (
                <div key={group.id}>
                  <div className="mb-2">
                    <h3 className="font-semibold text-lg">{group.groupName}</h3>
                    <p className="text-sm text-muted-foreground">{getSelectionText(group)}</p>
                  </div>
                  <div className="space-y-2">
                  {isSingleSelect ? (
                    <RadioGroup value={currentSelection[0]} onValueChange={(val) => handleSelectionChange(group.id, val, false)}>
                        {productsInGroup.map(p => (
                          <div key={p.id} className="flex items-center space-x-3 p-2 rounded-md hover:bg-accent">
                            <RadioGroupItem value={p.id} id={`${group.id}-${p.id}`} />
                            <Label htmlFor={`${group.id}-${p.id}`} className="flex-1 cursor-pointer font-normal">{p.productName}</Label>
                          </div>
                        ))}
                    </RadioGroup>
                  ) : (
                    productsInGroup.map(p => {
                      const isChecked = currentSelection.includes(p.id);
                      const maxReached = Number(group.maxSelection) > 0 && currentSelection.length >= Number(group.maxSelection);
                      return (
                        <div key={p.id} className="flex items-center space-x-3 p-2 rounded-md hover:bg-accent">
                          <Checkbox
                            id={`${group.id}-${p.id}`}
                            onCheckedChange={(checked) => handleSelectionChange(group.id, p.id, true, !!checked)}
                            checked={isChecked}
                            disabled={!isChecked && maxReached}
                          />
                          <Label htmlFor={`${group.id}-${p.id}`} className="flex-1 cursor-pointer font-normal">{p.productName}</Label>
                        </div>
                      )
                    })
                  )}
                  </div>
                </div>
              );
            })}
          </div>
            <div className="p-4 pt-0">
                <div className="flex items-center justify-center gap-3 mb-4 rounded-lg bg-white p-3 border-2 border-transparent">
                    <Button
                        variant="outline"
                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        className="w-11 h-11 rounded-lg bg-gray-200 text-gray-800 flex items-center justify-center transition-all hover:bg-gray-300"
                    >
                        <Minus className="h-6 w-6" />
                    </Button>
                    <span className="text-2xl font-bold w-12 text-center">{quantity}</span>
                    <Button
                        variant="outline"
                        onClick={() => setQuantity(q => q + 1)}
                        className="w-11 h-11 rounded-lg bg-gray-200 text-gray-800 flex items-center justify-center transition-all hover:bg-gray-300"
                    >
                        <Plus className="h-6 w-6" />
                    </Button>
                </div>
                <Button
                    size="lg"
                    className="w-full h-14 bg-m3-orange hover:bg-m3-orange/90 text-m3-dark font-bold text-base"
                    onClick={handleAddToCart}
                    disabled={!isSelectionValid}
                >
                    <div className="flex w-full justify-between items-center">
                        <span>Add to Cart</span>
                        <span>DKK {totalItemPrice.toFixed(2)}</span>
                    </div>
                </Button>
            </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
