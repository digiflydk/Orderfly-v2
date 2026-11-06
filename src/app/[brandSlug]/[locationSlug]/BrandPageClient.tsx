
"use client";

import { useMemo } from 'react';
import { flattenMenu } from '@/lib/menu-display';
import type { Brand, Category, ComboMenu, Location, ProductForMenu, StandardDiscount } from '@/types';
import { MenuClient } from './menu-client';
import { readMenuPayload, type MenuPayload } from '@/lib/menu-payload';

interface BrandPageClientProps {
  initialNow: number;
  initialDeliveryType: 'pickup' | 'delivery';
  brand: Brand;
  location: Location;
  menu: MenuPayload;
  activeCombos: ComboMenu[];
  activeStandardDiscounts: StandardDiscount[];
}

export default function BrandPageClient({
  initialNow,
  initialDeliveryType,
  brand,
  location,
  menu,
  activeCombos,
  activeStandardDiscounts,
}: BrandPageClientProps) {
    
    const allProductsForLocation = useMemo(() => {
        return flattenMenu(readMenuPayload(menu).productsByCategory);
    }, [menu]);

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
            initialNow={initialNow}
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
