
"use client";

import { useMemo } from 'react';
import { flattenMenu } from '@/lib/menu-display';
import type { Brand, Category, ComboMenu, Location, ProductForMenu, StandardDiscount } from '@/types';
import { MenuClient } from './menu-client';

interface BrandPageClientProps {
  initialDeliveryType: 'pickup' | 'delivery';
  brand: Brand;
  location: Location;
  menu: {
    categories: Category[];
    productsByCategory: Record<string, ProductForMenu[]>;
    fallbackUsed?: boolean;
  };
  activeCombos: ComboMenu[];
  activeStandardDiscounts: StandardDiscount[];
}

export default function BrandPageClient({
  initialDeliveryType,
  brand,
  location,
  menu,
  activeCombos,
  activeStandardDiscounts,
}: BrandPageClientProps) {
    
    const allProductsForLocation = useMemo(() => {
        return flattenMenu(menu.productsByCategory);
    }, [menu.productsByCategory]);

    const offerCategoryPlaceholder: Category = {
        id: 'offers',
        categoryName: brand.offersHeading || 'Offers',
        locationIds: [location.id],
        isActive: true,
        sortOrder: -1, 
        brandId: brand.id,
    };
    
    const finalCategories = [offerCategoryPlaceholder, ...menu.categories].sort((a,b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

    return (
        <MenuClient 
            initialDeliveryType={initialDeliveryType}
            brand={brand}
            location={location}
            initialCategories={finalCategories}
            initialProducts={allProductsForLocation}
            initialActiveCombos={activeCombos}
            initialActiveStandardDiscounts={activeStandardDiscounts}
        />
    );
}
