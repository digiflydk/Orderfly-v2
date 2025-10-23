
'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { Minus, Plus, X } from 'lucide-react';
import type { Topping, ToppingGroup, CartItemTopping, StandardDiscount, Allergen } from '@/types';
import type { ProductForMenu } from '@/app/superadmin/products/actions';
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
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { DynamicIcon } from '../superadmin/dynamic-icon';
import { getAllergens } from '@/app/superadmin/allergens/actions';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { useAnalytics } from '@/context/analytics-context';

interface ProductDialogProps {
  product: ProductForMenu;
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


export function ProductDialog({ product, isOpen, setIsOpen, allToppingGroups, allToppings, applicableDiscount }: ProductDialogProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedToppings, setSelectedToppings] = useState<Record<string, CartItemTopping>>({});
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const { addToCart, deliveryType, location, cartTotal } = useCart();
  const { toast } = useToast();
  const { trackEvent } = useAnalytics();
  
  const relevantToppingGroups = useMemo(() => {
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
        .filter(group => group.toppings.length > 0);
  }, [product.toppingGroupIds, allToppingGroups, allToppings]);

  useEffect(() => {
    if (isOpen && location) {
      setQuantity(1);

      const defaultToppings: Record<string, CartItemTopping> = {};
      relevantToppingGroups.forEach(group => {
          group.toppings.forEach(topping => {
              if (topping.isDefault) {
                  defaultToppings[topping.id] = { name: topping.toppingName, price: topping.price };
              }
          });
      });
      setSelectedToppings(defaultToppings);
      
      async function fetchAllergens() {
        if(product.allergenIds && product.allergenIds.length > 0) {
            const all = await getAllergens();
            const productAllergens = all.filter(a => product.allergenIds?.includes(a.id));
            setAllergens(productAllergens);
        } else {
            setAllergens([]);
        }
      }
      fetchAllergens();

      trackEvent('view_product', {
          productId: product.id,
          productName: product.productName,
          price: finalPrice,
          locationId: location.id,
          locationSlug: location.slug,
      });

    }
  }, [isOpen, product, relevantToppingGroups, trackEvent, location]);
  
  const basePrice = useMemo(() => {
    return (product as any).basePrice ?? (deliveryType === 'delivery' ? (product.priceDelivery ?? product.price) : product.price);
  }, [product, deliveryType]);
  
  const finalPrice = product.price;

  const handleToppingChange = (topping: Topping, isChecked: boolean, isSingleSelect: boolean) => {
    setSelectedToppings(prev => {
        const newSelected = { ...prev };
        
        if (isSingleSelect) {
            const groupToppings = relevantToppingGroups.find(g => g.id === topping.groupId)?.toppings || [];
            groupToppings.forEach(t => {
                delete newSelected[t.id];
            });
            if (isChecked) {
                newSelected[topping.id] = { name: topping.toppingName, price: topping.price };
            }
        } else {
            if (isChecked) {
                newSelected[topping.id] = { name: topping.toppingName, price: topping.price };
            } else {
                delete newSelected[topping.id];
            }
        }
        return newSelected;
    });
  };
  
  const toppingsTotal = Object.values(selectedToppings).reduce((sum, topping) => sum + topping.price, 0);
  const totalItemPrice = (finalPrice + toppingsTotal) * quantity;

  const isSelectionValid = useMemo(() => {
    return relevantToppingGroups.every(group => {
        const count = Object.keys(selectedToppings).filter(tid => group.toppings.some(t => t.id === tid)).length;
        const min = Number(group.minSelection);
        const max = Number(group.maxSelection);

        if (count < min) return false;
        if (max > 0 && count > max) return false;
        
        return true;
    });
}, [selectedToppings, relevantToppingGroups]);

  const handleAddToCart = () => {
    if (!isSelectionValid) return;
    const finalToppings = Object.values(selectedToppings);
    addToCart(product, quantity, finalToppings, basePrice, finalPrice);
    
    trackEvent('add_to_cart', {
        productId: product.id,
        productName: product.productName,
        price: finalPrice,
        quantity: quantity,
        cartValue: cartTotal + totalItemPrice
    });

    setIsOpen(false);
  }
  
  const hasOptions = allergens.length > 0 || relevantToppingGroups.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="p-0 flex flex-col h-full sm:max-h-[90vh] max-w-lg bg-[#FFF8F0]">
        <div className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
                <div className="relative aspect-video w-full shrink-0">
                    <Image 
                        src={product.imageUrl || 'https://placehold.co/400x300.png'} 
                        alt={product.productName}
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
                <div className="p-6 space-y-6">
                    <DialogHeader className="text-left space-y-2">
                        <DialogTitle className="text-2xl">{product.productName}</DialogTitle>
                        {product.description && <DialogDescription className="text-base">{product.description}</DialogDescription>}
                    </DialogHeader>
                    
                    {hasOptions && (
                        <>
                            <Separator />
                            {allergens.length > 0 && (
                                <div>
                                    <h3 className="font-semibold text-lg mb-2">Allergens</h3>
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

                            {relevantToppingGroups.length > 0 && <Separator />}

                            {relevantToppingGroups.map(group => {
                                const isSingleSelect = Number(group.maxSelection) === 1;
                                const currentSelection = Object.keys(selectedToppings).filter(tid => group.toppings.some(t => t.id === tid));

                                return (
                                    <div key={group.id}>
                                        <div className="mb-2">
                                        <h3 className="font-semibold text-lg">{group.groupName}</h3>
                                        <p className="text-sm text-muted-foreground">{getSelectionText(group)}</p>
                                        </div>
                                        <div className="space-y-2">
                                            {isSingleSelect ? (
                                                <RadioGroup value={currentSelection[0]} onValueChange={(val) => handleToppingChange(group.toppings.find(t => t.id === val)!, true, true)}>
                                                    {group.toppings.map(topping => (
                                                    <div key={`${product.id}-${topping.id}`} className="flex items-center justify-between p-2 rounded-md hover:bg-accent">
                                                        <div className="flex items-center space-x-3">
                                                            <RadioGroupItem value={topping.id} id={`${product.id}-${topping.id}`} />
                                                            <Label htmlFor={`${product.id}-${topping.id}`} className="flex-1 cursor-pointer font-normal">{topping.toppingName}</Label>
                                                        </div>
                                                        <span className="text-sm text-muted-foreground">+DKK {topping.price.toFixed(2)}</span>
                                                    </div>
                                                    ))}
                                                </RadioGroup>
                                            ) : (
                                                group.toppings.map(topping => {
                                                const isChecked = currentSelection.includes(topping.id);
                                                const maxReached = Number(group.maxSelection) > 0 && currentSelection.length >= Number(group.maxSelection);
                                                return (
                                                    <div key={`${product.id}-${topping.id}`} className="flex items-center justify-between p-2 rounded-md hover:bg-accent">
                                                        <div className="flex items-center space-x-3">
                                                            <Checkbox 
                                                                id={`${product.id}-${topping.id}`} 
                                                                onCheckedChange={(checked) => handleToppingChange(topping, !!checked, false)}
                                                                checked={!!selectedToppings[topping.id]}
                                                                disabled={!selectedToppings[topping.id] && maxReached}
                                                            />
                                                            <Label htmlFor={`${product.id}-${topping.id}`} className="flex-1 cursor-pointer font-normal">
                                                                {topping.toppingName}
                                                            </Label>
                                                        </div>
                                                        <span className="text-sm text-muted-foreground">
                                                            +DKK {topping.price.toFixed(2)}
                                                        </span>
                                                </div>
                                                )
                                            })
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </ScrollArea>
             <div className="w-full mt-auto sticky bottom-0">
                <div className="flex items-center justify-center gap-3 p-3 bg-[#FFF8F0] border-t">
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
                    className="w-full h-14 bg-m3-orange hover:bg-m3-orange/90 text-m3-dark font-bold text-base px-6 rounded-none"
                    onClick={handleAddToCart}
                    disabled={!isSelectionValid}
                >
                    <div className="flex w-full justify-between items-center">
                        <span>Add to Cart</span>
                        <span>DKK {totalItemPrice.toFixed(2)}</span>
                    </div>
                </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
