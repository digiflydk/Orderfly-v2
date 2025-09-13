

import { getCombos } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { CombosClientPage } from './client-page';
import type { Brand, Location } from '@/types';
import { getAllLocations } from '../locations/actions';

export default async function CombosPage() {
    const [combos, brands, locations] = await Promise.all([
        getCombos(),
        getBrands(),
        getAllLocations(),
    ]);

    const brandMap = new Map(brands.map(b => [b.id, b.name]));
    const locationMap = new Map(locations.map(l => [l.id, l.name]));

    const combosWithDetails = combos.map(combo => ({
        ...combo,
        brandName: brandMap.get(combo.brandId) || 'Unknown Brand',
        locationNames: combo.locationIds.map(id => locationMap.get(id) || 'Unknown Location').join(', '),
    }));

    return (
       <CombosClientPage 
            initialCombos={combosWithDetails} 
            brands={brands} 
            locations={locations}
        />
    );
}
