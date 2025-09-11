
'use client';

import { useEffect, useState, useMemo } from 'react';
import type { Brand, Category, StandardDiscount, Location, ProductForMenu } from '@/types';
import { ProductCard, ProductCardSkeleton } from "@/components/product/product-card";
import { useCart } from '@/context/cart-context';

interface OffersSectionProps {
  brand: Brand;
  location: Location;
  activeDiscounts: StandardDiscount[];
  allProducts: ProductForMenu[]; // Receive all products for the location
  categoryRef: (el: HTMLDivElement | null) => void;
}

export function OffersSection({ brand, location, activeDiscounts, allProducts, categoryRef }: OffersSectionProps) {
  const { deliveryType } = useCart();
  const [isLoading, setIsLoading] = useState(false);

  const offerProducts = useMemo(() => {
    const promotionalDiscounts = activeDiscounts.filter(d => d.assignToOfferCategory);
    if (promotionalDiscounts.length === 0) return [];
    
    const productIdsInOffers = new Set<string>();

    promotionalDiscounts.forEach(d => {
      if (d.discountType === 'product') {
        d.referenceIds.forEach(id => productIdsInOffers.add(id));
      } else if (d.discountType === 'category') {
        const productsInCategory = allProducts.filter(p => p.categoryId && d.referenceIds.includes(p.categoryId));
        productsInCategory.forEach(p => productIdsInOffers.add(p.id));
      }
    });

    if (productIdsInOffers.size === 0) return [];
    
    const products = allProducts.filter(p => productIdsInOffers.has(p.id));

    return products.map(p => {
        const applicableDiscount = promotionalDiscounts.find(d => 
            (d.discountType === 'product' && d.referenceIds.includes(p.id)) ||
            (d.discountType === 'category' && p.categoryId && d.referenceIds.includes(p.categoryId))
        );
        const basePrice = deliveryType === 'delivery' ? (p.priceDelivery ?? p.price) : p.price;
        const discountedPrice = applicableDiscount && applicableDiscount.discountValue ? 
        (applicableDiscount.discountMethod === 'percentage' ? basePrice * (1 - (applicableDiscount.discountValue / 100)) : Math.max(0, basePrice - applicableDiscount.discountValue))
        : basePrice;
        
        return { ...p, id: `${p.id}-offer`, categoryId: 'offers', price: discountedPrice, basePrice };
    });

  }, [activeDiscounts, allProducts, deliveryType]);

  const offersCategory: Category = {
      id: 'offers',
      categoryName: brand.offersHeading || 'Offers',
      locationIds: [location.id],
      isActive: true,
      sortOrder: -1,
      brandId: brand.id,
  };

  if (offerProducts.length === 0) {
    return null;
  }

  return (
    <div id={`category-${offersCategory.id}`} ref={categoryRef} className="space-y-6 scroll-mt-24">
      <div>
        <h2 className="text-2xl font-bold">{offersCategory.categoryName}</h2>
      </div>
       <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
         {isLoading ? (
           <>
              <ProductCardSkeleton />
              <ProductCardSkeleton />
           </>
         ) : (
          offerProducts.map(product => (
            <ProductCard
                key={product.id}
                product={product}
                activeDiscounts={activeDiscounts}
            />
          ))
         )}
      </div>
    </div>
  );
}
