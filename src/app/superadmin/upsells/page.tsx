
import { getUpsells } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { UpsellsClientPage } from './client-page';
import type { Brand, Location } from '@/types';
import { getAllLocations } from '../locations/actions';

export default async function UpsellsPage() {
    const [upsells, brands, locations] = await Promise.all([
        getUpsells(),
        getBrands(),
        getAllLocations(),
    ]);

    const brandMap = new Map(brands.map(b => [b.id, b.name]));

    const upsellsWithDetails = upsells.map(upsell => ({
        ...upsell,
        brandName: brandMap.get(upsell.brandId) || 'Unknown Brand',
    }));

    return (
       <UpsellsClientPage 
            initialUpsells={upsellsWithDetails} 
            brands={brands} 
        />
    );
}
