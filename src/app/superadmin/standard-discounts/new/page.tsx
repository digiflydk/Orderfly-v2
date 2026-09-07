import { upsellClientData } from '@/lib/upsell-serialization';

import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { StandardDiscountFormPage } from '@/components/superadmin/standard-discount-form-page';
import { getCategories } from '@/app/superadmin/categories/actions';
import { getProducts } from '@/app/superadmin/products/actions';

export default async function NewStandardDiscountPage() {
    const [brands, locations, products, categories] = await Promise.all([
        getBrands(),
        getAllLocations(),
        getProducts(),
        getCategories(),
    ]);
    
    return (
        <StandardDiscountFormPage 
            brands={upsellClientData(brands)}
            locations={upsellClientData(locations)}
            products={upsellClientData(products)}
            categories={upsellClientData(categories)}
        />
    );
}
