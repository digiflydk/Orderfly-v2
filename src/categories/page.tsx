

import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getCategories } from './actions';
import { CategoriesClientPage } from './client-page';
import type { Brand, Location } from '@/types';


export default async function CategoriesPage() {
    const [categories, locations, brands] = await Promise.all([
        getCategories(),
        getAllLocations(),
        getBrands(),
    ]);

    const locationMap = new Map(locations.map(l => [l.id, { name: l.name, brandId: l.brandId }]));
    const brandMap = new Map(brands.map(b => [b.id, b.name]));

    const categoriesWithDetails = categories.map((category, index) => {
        // Correctly find brandName without overwriting brandId
        const brandName = brandMap.get(category.brandId) || 'Unknown Brand';
        
        return {
            ...category,
            sortOrder: category.sortOrder ?? index, // Fallback sortOrder
            brandName: brandName,
            locationNames: category.locationIds?.map(id => locationMap.get(id)?.name || 'Unknown Location').join(', ') || '',
        };
    });

    return (
        <CategoriesClientPage 
            initialCategories={categoriesWithDetails}
            locations={locations}
            brands={brands}
        />
    );
}

