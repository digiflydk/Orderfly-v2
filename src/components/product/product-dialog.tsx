

'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { MinusCircle, PlusCircle, X } from 'lucide-react';
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
  DialogFooter,
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

      // Initialize with default toppings
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
    // If product has a basePrice property, it's an offer product, use that as original price.
    // Otherwise, calculate the original price based on delivery type.
    return (product as any).basePrice ?? (deliveryType === 'delivery' ? (product.priceDelivery ?? product.price) : product.price);
  }, [product, deliveryType]);
  
  const finalPrice = product.price;

  const handleToppingChange = (topping: Topping, isChecked: boolean, isSingleSelect: boolean) => {
    setSelectedToppings(prev => {
        const newSelected = { ...prev };
        
        if (isSingleSelect) {
            // Remove other toppings from the same group
            const groupToppings = relevantToppingGroups.find(g => g.id === topping.groupId)?.toppings || [];
            groupToppings.forEach(t => {
                delete newSelected[t.id];
            });
            // Add the new one
            if (isChecked) {
                newSelected[topping.id] = { name: topping.toppingName, price: topping.price };
            }
        } else {
             // Handle multi-select
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
            </div>
            <div className="p-4 space-y-6">
                <DialogHeader className="text-left space-y-2">
                    <DialogTitle className="text-2xl">{product.productName}</DialogTitle>
                    {product.description && <DialogDescription className="text-base">{product.description}</DialogDescription>}
                </DialogHeader>
                
                {hasOptions && (
                    <>
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
                                                    <div key={`${product.id}-${topping.id}`} className="flex items-center space-x-3 p-2 rounded-md hover:bg-accent">
                                                        <RadioGroupItem value={topping.id} id={`${product.id}-${topping.id}`} />
                                                        <Label htmlFor={`${product.id}-${topping.id}`} className="flex-1 cursor-pointer font-normal">{topping.toppingName}</Label>
                                                        <span className="text-sm text-muted-foreground">+DKK {topping.price.toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </RadioGroup>
                                        ) : (
                                            group.toppings.map(topping => {
                                              const isChecked = currentSelection.includes(topping.id);
                                              const selectedInGroup = currentSelection;
                                              const maxReached = Number(group.maxSelection) > 0 && selectedInGroup.length >= Number(group.maxSelection);
                                              return (
                                                <div key={`${product.id}-${topping.id}`} className="flex items-center space-x-3 p-2 rounded-md hover:bg-accent">
                                                    <Checkbox 
                                                        id={`${product.id}-${topping.id}`} 
                                                        onCheckedChange={(checked) => handleToppingChange(topping, !!checked, false)}
                                                        checked={!!selectedToppings[topping.id]}
                                                        disabled={!selectedToppings[topping.id] && maxReached}
                                                    />
                                                    <Label htmlFor={`${product.id}-${topping.id}`} className="flex-1 cursor-pointer font-normal">
                                                        {topping.toppingName}
                                                    </Label>
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
        <DialogFooter className="p-0 border-t flex-shrink-0 flex flex-col items-center bg-[#FFF8F0] gap-4 w-full">
          <div className="flex items-center gap-2 pt-4">
            <Button variant="outline" size="icon" onClick={() => setQuantity(q => Math.max(1, q - 1))}>
              <MinusCircle />
            </Button>
            <span className="text-lg font-bold w-10 text-center">{quantity}</span>
            <Button variant="outline" size="icon" onClick={() => setQuantity(q => q + 1)}>
              <PlusCircle />
            </Button>
          </div>
          <Button
            size="lg"
            className="w-full h-16 rounded-none text-base bg-m3-orange hover:bg-m3-orange/90 text-m3-dark font-bold"
            onClick={handleAddToCart}
            disabled={!isSelectionValid}
          >
            <div className="flex w-full justify-between items-center">
                <span>Add to Cart</span>
                <div className="flex items-baseline gap-2">
                {basePrice > finalPrice && (
                <p className="text-sm font-normal line-through opacity-80">
                    kr. {((basePrice + toppingsTotal) * quantity).toFixed(2)}
                </p>
                )}
                <span>DKK {totalItemPrice.toFixed(2)}</span>
                </div>
            </div>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
