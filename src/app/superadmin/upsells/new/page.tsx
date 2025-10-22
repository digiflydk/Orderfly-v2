

import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { UpsellFormPage } from '@/components/superadmin/upsell-form-page';
import { getCategoriesForBrand, getProductsForBrand } from '@/app/superadmin/upsells/actions';

export default async function NewUpsellPage() {
    const [brands, locations, products, categories] = await Promise.all([
        getBrands(),
        getAllLocations(),
        // We can pass empty arrays initially, as they will be fetched on brand selection in the client
        Promise.resolve([]),
        Promise.resolve([]),
    ]);
    
    return (
        <UpsellFormPage 
            brands={brands} 
            locations={locations}
            products={products}
            categories={categories}
        />
    );
}

    

    
