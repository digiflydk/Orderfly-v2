

import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { DiscountFormPage } from '@/components/superadmin/discount-form-page';
import { getUsers } from '@/app/superadmin/users/actions';

export default async function NewDiscountPage() {
    const [brands, locations, users] = await Promise.all([
        getBrands(),
        getAllLocations(),
        getUsers() // Assuming you might need users for 'assignedToCustomerId'
    ]);
    
    return (
        <DiscountFormPage
            brands={brands} 
            locations={locations}
            users={users}
        />
    );
}
