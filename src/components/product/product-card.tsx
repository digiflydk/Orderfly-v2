
'use client';

import Image from 'next/image';
import { discountedUnit, money } from '@/lib/money';
import { isQuantityMethod, quantityOfferLabel } from '@/lib/automatic-discounts';
import type { StandardDiscount, ProductForMenu } from '@/types';
import { useState, useMemo, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { publicRead } from '@/lib/public-read';
import type { Topping, ToppingGroup } from '@/types';
const ProductDialog = dynamic(() => import('./product-dialog').then(module => module.ProductDialog));
import { useCart } from "@/context/cart-context";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { safeImage } from '@/lib/images';

interface ProductCardProps {
  product: ProductForMenu;
  activeDiscounts: StandardDiscount[];
}

function applyDiscount(price: number, discount: StandardDiscount): number {
  return discountedUnit(price, discount.discountMethod, discount.discountValue);
}

export function ProductCardSkeleton() {
  return (
    <div className="flex w-full items-start gap-4 py-4 border-b">
      <Skeleton className="h-24 w-24 rounded-md shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
        <div className="pt-2 flex items-center justify-between">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
      </div>
    </div>
  );
}


export function ProductCard({ product, activeDiscounts }: ProductCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [allToppingGroups, setAllToppingGroups] = useState<any[]>([]);
  const [allToppings, setAllToppings] = useState<any[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [optionError, setOptionError] = useState(false);
  const pending = useRef(false);
  const generation = useRef(0);
  const { toast } = useToast();

  const { deliveryType, location } = useCart();

  const priceData = useMemo(() => {
    const originalPrice = money(deliveryType === 'delivery' ? (product.priceDelivery ?? product.price) : product.price);

    if ((product as any).basePrice) {
        return {
            basePrice: (product as any).basePrice,
            finalPrice: product.price,
            hasOffer: true
        };
    }

    const applicableDiscount = activeDiscounts
      .filter(d => !isQuantityMethod(d.discountMethod) && (
          (d.discountType === 'product' && d.referenceIds.includes(product.id)) || 
          (d.discountType === 'category' && product.categoryId && d.referenceIds.includes(product.categoryId))
      ))
      .reduce<StandardDiscount | null>((best, current) => {
          if (!best) return current;
          const bestDiscountedPrice = applyDiscount(originalPrice, best);
          const currentDiscountedPrice = applyDiscount(originalPrice, current);
          return currentDiscountedPrice < bestDiscountedPrice ? current : best;
      }, null);

    if (applicableDiscount) {
        const discountedPrice = applyDiscount(originalPrice, applicableDiscount);
        if (discountedPrice < originalPrice) {
            return {
                basePrice: originalPrice,
                finalPrice: discountedPrice,
                hasOffer: true,
                applicableDiscount,
            };
        }
    }
    
    return {
        basePrice: originalPrice,
        finalPrice: originalPrice,
        hasOffer: false,
        applicableDiscount: null,
    };
  }, [product, activeDiscounts, deliveryType]);


  const { basePrice, finalPrice, hasOffer, applicableDiscount } = priceData;

  const productForDialog: ProductForMenu & { basePrice?: number } = useMemo(() => ({
      ...product,
      price: finalPrice,
      basePrice: hasOffer ? basePrice : undefined,
  }), [product, finalPrice, basePrice, hasOffer]);

  const getBadgeText = () => {
    if (hasOffer) return "Offer";
    const quantityOffer = activeDiscounts.find(d => isQuantityMethod(d.discountMethod) &&
      ((d.discountType === 'product' && d.referenceIds.includes(product.id)) ||
       (d.discountType === 'category' && !!product.categoryId && d.referenceIds.includes(product.categoryId))));
    if (quantityOffer) return quantityOfferLabel(quantityOffer);
    if (product.isFeatured) return "Featured";
    if (product.isNew) return "New";
    if (product.isPopular) return "Popular";
    return null;
  };

  const badgeText = getBadgeText();
  
  useEffect(() => () => { generation.current++; pending.current = false; }, [product.id, location?.id]);
  const handleCardClick = async () => {
    if (!location || pending.current) return;
    const request = ++generation.current;
    pending.current = true;
    setIsPending(true); setOptionError(false);
    try {
      const options = product.toppingGroupIds?.length
        ? await publicRead<{toppings: Topping[]; groups: ToppingGroup[]}>(`/api/public/product-options?${new URLSearchParams({brandId: product.brandId, locationId: location.id})}`)
        : {toppings: [], groups: []};
      if (request !== generation.current) return;
      if (!Array.isArray(options.toppings) || !Array.isArray(options.groups)) throw new Error('Invalid option response');
      setAllToppings(options.toppings); setAllToppingGroups(options.groups); setIsDialogOpen(true);
    } catch { if (request === generation.current) setOptionError(true); }
    finally { if (request === generation.current) {pending.current = false; setIsPending(false);} }
  };


  return (
    <>
      <div 
        className="group flex w-full items-start gap-4 cursor-pointer border-b py-4"
        onClick={handleCardClick}
      >
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md">
          <Image
            src={safeImage(product.imageUrl)}
            alt={product.productName || 'Product image'}
            fill
            sizes="96px"
            className="object-cover"
            data-ai-hint="delicious food"
          />
          {badgeText && (
            <Badge className={cn(
                "absolute top-2 left-2",
                hasOffer && "bg-destructive/80"
            )}>
                {badgeText}
            </Badge>
          )}
        </div>

        <div className="flex-1 flex flex-col h-full">
          <div className="flex-1">
            <h4 className="font-semibold">{product.productName}</h4>
            <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
          </div>
          <div className="flex items-center justify-between mt-2">
            <div>
              {hasOffer ? (
                <>
                  <p className="font-semibold text-sm text-destructive">kr. {finalPrice?.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground line-through">kr. {basePrice?.toFixed(2)}</p>
                </>
              ) : (
                <p className="font-semibold text-foreground">kr. {finalPrice.toFixed(2)}</p>
              )}
            </div>
            <Button type="button" aria-label={`Tilføj ${product.productName}`} aria-busy={isPending} disabled={isPending} size="icon" className="h-10 w-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md shrink-0">
                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5"/>}
            </Button>
          </div>
        </div>
      </div>
      {optionError && <p role="alert" className="text-sm text-destructive">Tilvalg kunne ikke indlæses. <button className="underline" onClick={handleCardClick}>Prøv igen</button></p>}
      {isDialogOpen && <ProductDialog
        product={productForDialog}
        allToppingGroups={allToppingGroups}
        allToppings={allToppings}
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        applicableDiscount={applicableDiscount}
      />}
    </>
  );
}
