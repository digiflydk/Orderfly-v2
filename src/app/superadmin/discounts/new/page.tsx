

import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { DiscountFormPage } from '@/components/superadmin/discount-form-page';


export default async function NewDiscountPage() {
    const [brands, locations] = await Promise.all([
        getBrands(),
        getAllLocations(),

    ]);
    
    return (
        <DiscountFormPage
            brands={brands} 
            locations={locations}

        />
    );
}
