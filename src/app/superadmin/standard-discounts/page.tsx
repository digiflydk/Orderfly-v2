

import { getStandardDiscounts } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { StandardDiscountsClientPage } from './client-page';
import type { Brand, Location, Discount } from '@/types';
import { getAllLocations } from '../locations/actions';

export default async function StandardDiscountsPage() {
    const [discounts, brands, locations] = await Promise.all([
        getStandardDiscounts(),
        getBrands(),
        getAllLocations(),
    ]);

    const brandMap = new Map(brands.map(b => [b.id, b.name]));

    const discountsWithDetails = discounts.map(discount => ({
        ...discount,
        brandName: brandMap.get(discount.brandId) || 'Unknown Brand',
    }));

    return (
       <StandardDiscountsClientPage 
            initialDiscounts={discountsWithDetails} 
            brands={brands} 
            locations={locations}
        />
    );
}
