import { upsellClientData } from '@/lib/upsell-serialization';

import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { StandardDiscountFormPage } from '@/components/superadmin/standard-discount-form-page';
import { getCategories } from '@/app/superadmin/categories/actions';
import { getProducts } from '@/app/superadmin/products/actions';
import { loadSuperadminPage } from '@/lib/access/superadmin-page';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';

export default async function NewStandardDiscountPage() {
    const result = await loadSuperadminPage('orderfly.discounts:view', () => Promise.all([
        getBrands(),
        getAllLocations(),
        getProducts(),
        getCategories(),
    ]));
    if (!result) return <AccessDeniedPage />;
    const [brands, locations, products, categories] = result;
    
    return (
        <StandardDiscountFormPage 
            brands={upsellClientData(brands)}
            locations={upsellClientData(locations)}
            products={upsellClientData(products)}
            categories={upsellClientData(categories)}
        />
    );
}
