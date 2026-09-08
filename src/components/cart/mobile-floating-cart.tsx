

'use client';

import { useMenuCheckout } from '@/hooks/use-menu-checkout';
import { ShoppingBag, Trash2, Loader2, Tag } from 'lucide-react';
import Image from 'next/image';

import { useCart } from '@/context/cart-context';
import { UpsellDialog } from '@/components/checkout/upsell-dialog';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '../ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
  SheetDescription,
} from '@/components/ui/sheet';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { safeImage } from '@/lib/images';

function CartContents() {
    const { cartItems, removeFromCart, updateQuantity, checkoutTotal, subtotal, itemDiscount, cartDiscount, voucherDiscount, deliveryFee, freeDeliveryDiscountApplied, bagFee, adminFee, vatAmount, brand } = useCart();
    const menuTotal = Math.max(0, checkoutTotal - bagFee);

    return (
        <>
            <ScrollArea className="flex-1 px-4">
                <div className="space-y-4">
                    {cartItems.map(item => {
                        const toppingsPrice = item.toppings.reduce((sum, topping) => sum + topping.price, 0) * item.quantity;
                        const originalLinePrice = item.basePrice * item.quantity + toppingsPrice;
                        const discountedLinePrice = item.price * item.quantity + toppingsPrice;
                        const hasDiscount = originalLinePrice > discountedLinePrice;

                        return (
                            <div key={item.cartItemId} className="flex items-start gap-4">
                                <div className="relative h-16 w-16 shrink-0">
                                <Image
                                    src={safeImage(item.imageUrl)}
                                    alt={item.productName}
                                    fill sizes="64px"
                                    className="rounded-md object-cover"
                                    data-ai-hint="delicious food"
                                />
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium">{item.productName} {item.itemType === 'combo' && <Badge>Combo</Badge>}</div>
                                    <div className="text-sm">
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
                                        <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                                        >
                                        -
                                        </Button>
                                        <span>{item.quantity}</span>
                                        <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                                        >
                                        +
                                        </Button>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive"
                                        onClick={() => removeFromCart(item.cartItemId)}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </ScrollArea>
            <SheetFooter className="mt-auto flex-col space-y-0 p-0">
              <div className="space-y-4 px-4 py-4">
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
                <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>kr.{menuTotal.toFixed(2)}</span>
                </div>
              </div>
            </SheetFooter>
        </>
    );
}


export function MobileFloatingCart() {
  const { cartItems, itemCount, cartTotal, checkoutTotal, bagFee, brand, location, subtotal, itemDiscount, cartDiscount, voucherDiscount, deliveryType } = useCart();
  const menuTotal = Math.max(0, checkoutTotal - bagFee);
  const { isPending, activeUpsell, isUpsellDialogOpen, setIsUpsellDialogOpen, proceedToCheckout, handleCheckoutClick } = useMenuCheckout();
  if (itemCount === 0) return null;

  return (
    <>
      <div className="h-14 md:hidden" aria-hidden="true" />
      <Sheet>
        <SheetTrigger asChild>
            <div
                className="fixed left-0 right-0 bottom-0 z-50 md:hidden"
            >
                <Button
                    size="lg"
                    className="w-full h-14 rounded-none text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                    <div className="w-full flex justify-between items-center px-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground text-primary">
                                {itemCount}
                            </div>
                            <span className="font-bold">View cart</span>
                        </div>
                        <span className="font-bold">kr. {menuTotal.toFixed(2)}</span>
                    </div>
                </Button>
            </div>
        </SheetTrigger>
        <SheetContent className="flex flex-col w-[99vw] p-0">
            <SheetHeader className="p-4">
                <SheetTitle>{itemCount} products in your cart</SheetTitle>
                <SheetDescription>
                  Review items and proceed to checkout.
                </SheetDescription>
            </SheetHeader>
            <CartContents/>
            <SheetFooter className="p-0">
                <Button onClick={handleCheckoutClick} className="w-full h-14 rounded-none text-base font-bold" disabled={isPending}>
                    {isPending ? <Loader2 className="animate-spin" /> : 'Proceed to Checkout'}
                </Button>
            </SheetFooter>
        </SheetContent>
      </Sheet>
        {activeUpsell && (
        <UpsellDialog
            isOpen={isUpsellDialogOpen}
            setIsOpen={setIsUpsellDialogOpen}
            upsellData={activeUpsell}
            onContinue={proceedToCheckout}
        />
      )}
    </>
  );
}
