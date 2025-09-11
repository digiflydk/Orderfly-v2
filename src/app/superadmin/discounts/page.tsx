
import { getDiscounts } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { DiscountsClientPage } from './client-page';
import type { Brand, Location, Discount } from '@/types';
import { getAllLocations } from '../locations/actions';

export default async function DiscountsPage() {
    const [discounts, brands, locations] = await Promise.all([
        getDiscounts(),
        getBrands(),
        getAllLocations(),
    ]);

    const brandMap = new Map(brands.map(b => [b.id, b.name]));

    const discountsWithDetails = discounts.map(discount => ({
        ...discount,
        brandName: brandMap.get(discount.brandId) || 'Unknown Brand',
    }));

    return (
       <DiscountsClientPage 
            initialDiscounts={discountsWithDetails} 
            brands={brands} 
        />
    );
}
