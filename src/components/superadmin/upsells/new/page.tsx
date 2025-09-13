

import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { UpsellFormPage } from '@/components/superadmin/upsell-form-page';
import { getCategories } from '@/app/superadmin/categories/actions';
import { getProducts } from '@/app/superadmin/products/actions';

export default async function NewUpsellPage() {
    const [brands, locations, products, categories] = await Promise.all([
        getBrands(),
        getAllLocations(),
        getProducts(),
        getCategories(),
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

    

    
