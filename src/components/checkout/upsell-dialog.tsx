
'use client';

import Image from 'next/image';
import type { Product, Upsell, ProductForMenu } from '@/types';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { useMemo, useTransition, useEffect, useRef } from 'react';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';
import { incrementUpsellConversion } from '@/app/superadmin/upsells/actions';
import { Loader2 } from 'lucide-react';
import { useAnalytics } from '@/context/analytics-context';

interface UpsellDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  upsellData: { upsell: Upsell, products: ProductForMenu[] };
  onContinue: () => void;
}

export function UpsellDialog({ isOpen, setIsOpen, upsellData, onContinue }: UpsellDialogProps) {
  const { addToCart, deliveryType, cartTotal } = useCart();
  const { trackEvent } = useAnalytics();
  const { toast } = useToast();
  const { upsell, products: upsellProducts } = upsellData;
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      trackEvent('upsell_offer_shown', {
        upsellId: upsell.id,
        upsellName: upsell.upsellName,
        cartValue: cartTotal,
      });

      timerRef.current = setTimeout(() => {
        handleSkipAndContinue(true);
      }, 30000);

    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isOpen, upsell.id, upsell.upsellName, cartTotal, trackEvent]);

  const calculatePrices = (product: ProductForMenu) => {
    const originalPrice = deliveryType === 'delivery' ? (product.priceDelivery ?? product.price) : product.price;
    let finalPrice = originalPrice;
    let discountPercentage = 0;

    if (upsell.discountType !== 'none' && upsell.discountValue) {
        if (upsell.discountType === 'percentage') {
            discountPercentage = upsell.discountValue;
            finalPrice = originalPrice * (1 - (discountPercentage / 100));
        } else if (upsell.discountType === 'fixed_amount') {
            finalPrice = Math.max(0, originalPrice - upsell.discountValue);
            if (originalPrice > 0) {
              discountPercentage = Math.round(((originalPrice - finalPrice) / originalPrice) * 100);
            }
        }
    }
    return { originalPrice, finalPrice, discountPercentage };
  }

  const handleProductClick = (product: ProductForMenu) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    startTransition(async () => {
        const { originalPrice, finalPrice } = calculatePrices(product);
        
        addToCart(product, 1, [], originalPrice, finalPrice);
        
        await incrementUpsellConversion(upsell.id);

        trackEvent('upsell_accepted', {
            upsellId: upsell.id,
            productId: product.id,
            productName: product.productName,
            finalPrice: finalPrice,
        });
        
        toast({
            title: 'Item Added',
            description: `${product.productName} has been added to your cart.`,
        });
        
        setIsOpen(false);
        onContinue();
    });
  };
  
  const handleSkipAndContinue = (isAutoReject = false) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    trackEvent('upsell_rejected', {
        upsellId: upsell.id,
        upsellName: upsell.upsellName,
        auto: isAutoReject,
    });
    setIsOpen(false);
    onContinue();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if(!open) handleSkipAndContinue();
    }}>
      <DialogContent 
        className="w-full sm:max-w-4xl p-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 border-0
                   bottom-0 rounded-t-2xl h-[90vh] sm:h-auto sm:bottom-auto sm:rounded-lg flex flex-col
                   data-[state=closed]:slide-out-to-bottom sm:data-[state=closed]:slide-out-to-top-[48%]
                   data-[state=open]:slide-in-from-bottom sm:data-[state=open]:slide-in-from-top-[48%]"
      >
        <DialogHeader className="px-6 pt-6 text-center">
          <DialogTitle className="text-2xl font-bold tracking-wider uppercase">{upsell.upsellName}</DialogTitle>
          {upsell.description && (
            <DialogDescription className="text-center">{upsell.description}</DialogDescription>
          )}
        </DialogHeader>
        
        <ScrollArea className="flex-1 px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
                {upsellProducts.map(product => {
                    const { originalPrice, finalPrice, discountPercentage } = calculatePrices(product);
                    const hasDiscount = originalPrice > finalPrice;
                    
                    return (
                        <div key={product.id} className="relative group flex flex-col overflow-hidden rounded-lg border">
                            <div className="aspect-video w-full relative">
                                <Image 
                                    src={upsell.imageUrl || product.imageUrl || 'https://placehold.co/400x300.png'} 
                                    alt={product.productName} 
                                    fill 
                                    className="object-cover"
                                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                    data-ai-hint="delicious food"
                                />
                                {hasDiscount && (
                                    <Badge className="absolute top-2 left-2" variant="destructive">Save {discountPercentage}%</Badge>
                                )}
                            </div>
                            <div className="p-3 bg-card flex flex-col flex-1">
                                <h3 className="font-bold truncate">{product.productName}</h3>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <p className="font-bold text-lg text-primary">kr. {finalPrice.toFixed(2)}</p>
                                    {hasDiscount && (
                                        <p className="text-sm text-muted-foreground line-through">kr. {originalPrice.toFixed(2)}</p>
                                    )}
                                </div>
                                <Button className="w-full mt-auto" onClick={() => handleProductClick(product)} disabled={isPending}>
                                    {isPending ? <Loader2 className="animate-spin" /> : 'Add to cart'}
                                </Button>
                            </div>
                        </div>
                    )
                })}
            </div>
             <DialogFooter className="px-0 pb-6 pt-4 mt-auto sm:justify-center">
                <Button variant="link" size="sm" onClick={() => handleSkipAndContinue(false)} className="w-full sm:w-auto text-muted-foreground">
                    No thanks, continue to payment
                </Button>
            </DialogFooter>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
    
