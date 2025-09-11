

import { getAllLocations } from './actions';
import { getBrands } from '../brands/actions';
import { LocationsClientPage } from './client-page';
import type { Brand, Location } from '@/types';

export default async function LocationsOverviewPage() {
    const [locations, brands] = await Promise.all([
        getAllLocations(),
        getBrands()
    ]);

    const brandsMap = new Map(brands.map(b => [b.id, b.name]));

    const locationsWithBrandNames = locations.map(location => ({
        ...location,
        brandName: brandsMap.get(location.brandId) || 'Unknown Brand',
    }));

    return (
       <LocationsClientPage initialLocations={locationsWithBrandNames} brands={brands} />
    );
}
