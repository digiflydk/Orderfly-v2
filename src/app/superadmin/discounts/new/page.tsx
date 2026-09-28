

import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { DiscountFormPage } from '@/components/superadmin/discount-form-page';
import { loadSuperadminPage } from '@/lib/access/superadmin-page';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';


export default async function NewDiscountPage() {
    const result = await loadSuperadminPage('orderfly.discounts:view', () => Promise.all([
        getBrands(),
        getAllLocations(),
    ]));
    if (!result) return <AccessDeniedPage />;
    const [brands, locations] = result;
    
    return (
        <DiscountFormPage
            brands={brands} 
            locations={locations}

        />
    );
}
