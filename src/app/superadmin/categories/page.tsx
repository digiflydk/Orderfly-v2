

import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getCategories } from './actions';
import { CategoriesClientPage } from './client-page';
import type { Brand, Location } from '@/types';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';


async function CategoriesPageContent() {
    const [categories, locations, brands] = await Promise.all([
        getCategories(),
        getAllLocations(),
        getBrands(),
    ]);

    const locationMap = new Map(locations.map(l => [l.id, { name: l.name, brandId: l.brandId }]));
    const brandMap = new Map(brands.map(b => [b.id, b.name]));

    const categoriesWithDetails = categories.map((category, index) => {
        let brandId: string | undefined;
        let brandName: string | undefined;

        // Iterate through all locationIds until a valid brand is found
        for (const locId of category.locationIds) {
            const locInfo = locationMap.get(locId);
            if (locInfo && locInfo.brandId) {
                brandId = locInfo.brandId;
                brandName = brandMap.get(brandId) || 'Unknown Brand';
                break; // Found a valid brand, no need to look further
            }
        }
        
        return {
            ...category,
            sortOrder: category.sortOrder ?? index, // Fallback sortOrder
            locationNames: category.locationIds?.map(id => locationMap.get(id)?.name || 'Unknown Location').join(', ') || '',
            brandId: brandId,
            brandName: brandName || 'Unknown Brand'
        };
    }).sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

    return (
        <CategoriesClientPage 
            initialCategories={categoriesWithDetails}
            locations={locations}
            brands={brands}
        />
    );
}

export default function CategoriesPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <CategoriesPageContent />;
}
