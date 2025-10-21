
'use client';

import Image from "next/image";
import type { Topping, ToppingGroup, StandardDiscount, Allergen } from "@/types";
import type { ProductForMenu } from "@/app/superadmin/products/actions";
import { useState, useMemo, useTransition, useEffect } from "react";
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
    <div className="flex items-stretch gap-2 py-4 border-b md:border md:p-3 md:rounded-lg">
      <Skeleton className="w-24 h-24 md:w-36 md:h-[99px] rounded-md shrink-0" />
      <div className="flex-1 flex flex-col space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex-1" />
        <Skeleton className="h-5 w-1/4 mt-auto" />
      </div>
    </div>
  );
}


export function ProductCard({ product, activeDiscounts }: ProductCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [allToppingGroups, setAllToppingGroups] = useState<ToppingGroup[]>([]);
  const [allToppings, setAllToppings] = useState<Topping[]>([]);
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

    // Only fetch toppings if the product has them
    if (product.toppingGroupIds && product.toppingGroupIds.length > 0) {
        startTransition(async () => {
            const [toppings, toppingGroups] = await Promise.all([
                getToppings(location.id),
                getToppingGroups(location.id)
            ]);
            setAllToppings(toppings);
            setAllToppingGroups(toppingGroups);
            setIsDialogOpen(true);
        });
    } else {
        // If no toppings, open dialog immediately
        setAllToppings([]);
        setAllToppingGroups([]);
        setIsDialogOpen(true);
    }
  };


  return (
    <>
      <div 
        className="group flex items-stretch gap-4 cursor-pointer transition-all duration-200 ease-in-out border-b py-4 md:border md:p-3 md:rounded-lg md:shadow-sm md:hover:shadow-lg md:hover:-translate-y-0.5"
        onClick={handleCardClick}
      >
        <div className="relative w-24 h-24 md:w-36 md:h-auto shrink-0">
          <Image
            src={product.imageUrl || 'https://placehold.co/400x225.png'}
            alt={product.productName}
            fill
            className="object-cover rounded-md"
            sizes="(max-width: 768px) 33vw, 25vw"
            data-ai-hint="delicious food"
          />
          {badgeText && (
            <Badge className={cn(
                "absolute top-2 left-2 border-white/50 bg-black/20 text-white backdrop-blur-sm",
                hasOffer && "bg-destructive/70"
            )}>
                {badgeText}
            </Badge>
          )}
        </div>

        <div className="flex-1 flex flex-col">
          <div>
            <h4 className="font-semibold text-sm pr-2">{product.productName}</h4>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{product.description}</p>
          </div>
          <div className="flex-grow" />
          <div className="flex items-end justify-between mt-auto pt-2">
            <div>
                {hasOffer ? (
                  <>
                    <p className="font-semibold text-sm text-destructive">DKK {finalPrice?.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground line-through">DKK {basePrice?.toFixed(2)}</p>
                  </>
                ) : (
                  <p className="font-semibold text-sm text-foreground">DKK {finalPrice.toFixed(2)}</p>
                )}
            </div>
            <Button size="icon" className="h-10 w-10 bg-m3-button hover:bg-m3-buttonHover text-m3-dark rounded-md shrink-0">
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
