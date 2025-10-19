
"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Brand, Category, ComboMenu, Location, ProductForMenu, StandardDiscount } from '@/types';
import { useCart } from '@/context/cart-context';
import { getActiveStandardDiscounts } from '@/app/superadmin/standard-discounts/actions';
import { getProductsByIds } from '@/app/superadmin/products/actions';
import { useAnalytics } from '@/context/analytics-context';
import { getTimeSlots, TimeSlotResponse } from '@/app/superadmin/locations/actions';

import { MenuClient } from './menu-client';

interface BrandPageClientProps {
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
  brand,
  location,
  menu,
  activeCombos,
  activeStandardDiscounts,
}: BrandPageClientProps) {
    
    // Create a flat list of all products from the menu structure
    const allProductsForLocation = useMemo(() => {
        return Object.values(menu.productsByCategory).flat();
    }, [menu.productsByCategory]);

    // Create a placeholder for the "Offers" category if needed later on the client.
    const offerCategoryPlaceholder = {
        id: 'offers',
        categoryName: brand.offersHeading || 'Offers',
        locationIds: [location.id],
        isActive: true,
        sortOrder: -1, // Ensures "Offers" comes first
        brandId: brand.id,
    };
    
    const finalCategories = [offerCategoryPlaceholder, ...menu.categories].sort((a,b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

    return (
        <MenuClient 
            brand={brand}
            location={location}
            initialCategories={finalCategories}
            initialProducts={allProductsForLocation}
            initialActiveCombos={activeCombos}
            initialActiveStandardDiscounts={activeStandardDiscounts}
        />
    );
}
