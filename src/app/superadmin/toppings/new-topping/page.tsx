

import { ToppingFormPage } from '@/components/superadmin/topping-form';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getToppingGroups } from '@/app/superadmin/toppings/actions';
import { getBrands } from '@/app/superadmin/brands/actions';

export default async function NewToppingPage() {
    const [locations, allGroups, brands] = await Promise.all([
        getAllLocations(),
        getToppingGroups(),
        getBrands()
    ]);
    
    return (
        <ToppingFormPage 
            locations={locations} 
            allGroups={allGroups}
            brands={brands}
        />
    );
}


