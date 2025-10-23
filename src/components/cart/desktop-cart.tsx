
'use client';

import { ShoppingBag, Trash2, Loader2, Tag } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { useCart } from '@/context/cart-context';
import type { Product, Upsell, ProductForMenu } from '@/types';
import { getActiveUpsellForCart } from '@/app/superadmin/upsells/actions';
import { UpsellDialog } from '@/components/checkout/upsell-dialog';
import { useAnalytics } from '@/context/analytics-context';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '../ui/badge';
import { useToast } from '@/hooks/use-toast';

export function DesktopCart() {
  const { 
      cartItems, 
      removeFromCart, 
      updateQuantity, 
      cartTotal, 
      itemCount, 
      brand, 
      location,
      subtotal,
      itemDiscount,
      cartDiscount,
      voucherDiscount,
      deliveryFee,
      freeDeliveryDiscountApplied,
      deliveryType
  } = useCart();
  const [isPending, startTransition] = useTransition();
  const [isUpsellDialogOpen, setIsUpsellDialogOpen] = useState(false);
  const [activeUpsell, setActiveUpsell] = useState<{upsell: Upsell, products: Product[]} | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { trackEvent } = useAnalytics();


  const proceedToCheckout = () => {
    if (brand && location) {
      router.push(`/${brand.slug}/${location.slug}/checkout`);
    }
  };

  const handleCheckoutClick = () => {
    if (!location) return;

    trackEvent('start_checkout', { 
        cartValue: cartTotal, 
        itemsCount: itemCount, 
        deliveryType: deliveryType,
        locationId: location.id,
        locationSlug: location.slug,
    });

    startTransition(async () => {
      if (brand && location) {
        const minimalCartItems = cartItems.map(item => ({
            id: item.id,
            categoryId: item.categoryId
        }));
        
        const upsellData = await getActiveUpsellForCart({
            brandId: brand.id,
            locationId: location.id,
            cartItems: minimalCartItems,
            cartTotal: subtotal - (itemDiscount + (cartDiscount?.amount || 0) + (voucherDiscount?.amount || 0)),
        });

        if (upsellData) {
            setActiveUpsell(upsellData);
            setIsUpsellDialogOpen(true);
        } else {
            proceedToCheckout();
        }
      } else {
        proceedToCheckout();
      }
    });
  };

  return (
    <>
        <Card className="flex h-full flex-col">
            <CardHeader>
                <CardTitle>Your Cart</CardTitle>
                <CardDescription>{itemCount} items in your order.</CardDescription>
            </CardHeader>
             {cartItems.length > 0 ? (
                <>
                <ScrollArea className="flex-1">
                  <CardContent className="space-y-4">
                    {cartItems.map(item => {
                        const toppingsPrice = item.toppings.reduce((sum, topping) => sum + topping.price, 0) * item.quantity;
                        const originalLinePrice = item.basePrice * item.quantity + toppingsPrice;
                        const discountedLinePrice = item.price * item.quantity + toppingsPrice;
                        const hasDiscount = originalLinePrice > discountedLinePrice;

                        return (
                            <div key={item.cartItemId} className="flex items-start gap-4">
                                <div className="relative h-16 w-16 shrink-0">
                                <Image
                                    src={item.imageUrl || 'https://placehold.co/100x100.png'}
                                    alt={item.productName}
                                    fill
                                    className="rounded-md object-cover"
                                    data-ai-hint="delicious food"
                                />
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium text-sm">{item.productName} {item.itemType === 'combo' && <Badge>Combo</Badge>}</div>
                                    <div className="text-xs">
                                          {hasDiscount ? (
                                            <>
                                                <span className="font-bold text-foreground"> kr.{discountedLinePrice.toFixed(2)}</span>
                                                <span className="text-muted-foreground line-through ml-2">kr.{originalLinePrice.toFixed(2)}</span>
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground">kr.{discountedLinePrice.toFixed(2)}</span>
                                        )}
                                    </div>
                                    {item.toppings.length > 0 && (
                                        <ul className="text-xs text-muted-foreground pl-4 mt-1 list-disc">
                                            {item.toppings.map(topping => (
                                                <li key={topping.name}>{topping.name} (+kr.{topping.price.toFixed(2)})</li>
                                            ))}
                                        </ul>
                                    )}
                                    {item.comboSelections && item.comboSelections.length > 0 && (
                                        <ul className="text-xs text-muted-foreground pl-4 mt-1 list-disc">
                                            {item.comboSelections.flatMap(sel => sel.products).map(p => (
                                                <li key={p.id}>{p.name}</li>
                                            ))}
                                        </ul>
                                    )}
                                    <div className="mt-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}>-</Button>
                                            <span>{item.quantity}</span>
                                            <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}>+</Button>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeFromCart(item.cartItemId)}><Trash2 className="size-4" /></Button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                  </CardContent>
                </ScrollArea>
                <CardFooter className="flex-col space-y-4 pt-4 mt-auto">
                    <Separator />
                    <div className="w-full text-sm space-y-2">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span>kr.{subtotal.toFixed(2)}</span>
                        </div>
                        {itemDiscount > 0 && (
                           <div className="flex justify-between text-green-600">
                                <span>Item Discounts</span>
                                <span>- kr.{itemDiscount.toFixed(2)}</span>
                            </div>
                        )}
                        {cartDiscount && (
                             <div className="flex justify-between text-green-600">
                                <div className="flex items-center gap-1">
                                    <Tag className="h-4 w-4" />
                                    <span>{cartDiscount.name}</span>
                                </div>
                                <span>- kr.{cartDiscount.amount.toFixed(2)}</span>
                            </div>
                        )}
                         {voucherDiscount && (
                            <div className="flex justify-between text-green-600">
                                <div className="flex items-center gap-1">
                                    <Tag className="h-4 w-4" />
                                    <span>Code: {voucherDiscount.name}</span>
                                </div>
                                <span>- kr.{voucherDiscount.amount.toFixed(2)}</span>
                            </div>
                        )}
                        {freeDeliveryDiscountApplied && (
                            <div className="flex justify-between text-green-600">
                                <span>Free Delivery</span>
                                <span>- kr.{deliveryFee.toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                    <Separator/>
                    <div className="w-full flex justify-between font-bold">
                        <span>Total</span>
                        <span>kr.{cartTotal.toFixed(2)}</span>
                    </div>
                    <Button onClick={handleCheckoutClick} className="w-full font-bold" disabled={isPending}>
                        <div className="flex w-full justify-between items-center">
                            <span>{isPending ? <Loader2 className="animate-spin" /> : 'Proceed to Checkout'}</span>
                            <span>kr.{cartTotal.toFixed(2)}</span>
                        </div>
                    </Button>
                </CardFooter>
                </>
             ) : (
                <CardContent className="flex-1">
                    <div className="flex flex-col items-center justify-center text-center h-full text-muted-foreground">
                        <ShoppingBag className="mb-4 size-12" />
                        <p className="font-semibold">Your cart is empty.</p>
                        <p className="text-sm">Add some items to get started!</p>
                    </div>
                </CardContent>
             )}
        </Card>
       {activeUpsell && (
        <UpsellDialog
            isOpen={isUpsellDialogOpen}
            setIsOpen={setIsUpsellDialogOpen}
            upsellData={activeUpsell}
            onContinue={proceedToCheckout}
            onSuccess={() => { /* No revalidation needed here */ }}
        />
      )}
    </>
  );
}
