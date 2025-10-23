
'use client';

import Image from 'next/image';
import type { StandardDiscount, ProductForMenu } from '@/types';
import { useState, useMemo, useTransition } from 'react';
import { ProductDialog } from "./product-dialog";
import { useCart } from "@/context/cart-context";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Skeleton } from "../ui/skeleton";
import { getToppings, getToppingGroups } from "@/app/superadmin/toppings/actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus } from "lucide-react";
import { Button } from "../ui/button";

interface ProductCardProps {
  product: ProductForMenu;
  activeDiscounts: StandardDiscount[];
}

function applyDiscount(price: number, discount: StandardDiscount): number {
    if (discount.discountMethod === 'percentage' && discount.discountValue) {
        return price * (1 - (discount.discountValue / 100));
    }
    if (discount.discountMethod === 'fixed_amount' && discount.discountValue) {
        return Math.max(0, price - discount.discountValue);
    }
    return price;
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
  const [allToppingGroups, setAllToppingGroups] = useState([]);
  const [allToppings, setAllToppings] = useState([]);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const { deliveryType, location } = useCart();

  const priceData = useMemo(() => {
    const originalPrice = deliveryType === 'delivery' ? (product.priceDelivery ?? product.price) : product.price;

    if ((product as any).basePrice) {
        return {
            basePrice: (product as any).basePrice,
            finalPrice: product.price,
            hasOffer: true
        };
    }

    const applicableDiscount = activeDiscounts
      .filter(d => 
          (d.discountType === 'product' && d.referenceIds.includes(product.id)) || 
          (d.discountType === 'category' && product.categoryId && d.referenceIds.includes(product.categoryId))
      )
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

  const productForDialog: ProductForMenu & { basePrice?: number } = {
      ...product,
      price: finalPrice,
      basePrice: hasOffer ? basePrice : undefined,
  };

  const getBadgeText = () => {
    if (hasOffer) return "Offer";
    if (product.isFeatured) return "Featured";
    if (product.isNew) return "New";
    if (product.isPopular) return "Popular";
    return null;
  };

  const badgeText = getBadgeText();
  
  const handleCardClick = () => {
    if (!location) {
        toast({ variant: 'destructive', title: 'Error', description: 'Location not set.'});
        return;
    }

    if (product.toppingGroupIds && product.toppingGroupIds.length > 0) {
        startTransition(async () => {
            const [toppings, toppingGroups] = await Promise.all([
                getToppings(location.id),
                getToppingGroups(location.id)
            ]);
            setAllToppings(toppings as any);
            setAllToppingGroups(toppingGroups as any);
            setIsDialogOpen(true);
        });
    } else {
        setAllToppings([]);
        setAllToppingGroups([]);
        setIsDialogOpen(true);
    }
  };


  return (
    <>
      <div 
        className="group flex w-full items-start gap-4 cursor-pointer border-b py-4"
        onClick={handleCardClick}
      >
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md">
          <Image
            src={product.imageUrl || 'https://placehold.co/400x400.png'}
            alt={product.productName}
            fill
            sizes="(max-width: 768px) 25vw, 15vw"
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
            <Button size="icon" className="h-10 w-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md shrink-0">
                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5"/>}
            </Button>
          </div>
        </div>
      </div>
      <ProductDialog
        product={productForDialog}
        allToppingGroups={allToppingGroups}
        allToppings={allToppings}
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        applicableDiscount={applicableDiscount}
      />
    </>
  );
}
