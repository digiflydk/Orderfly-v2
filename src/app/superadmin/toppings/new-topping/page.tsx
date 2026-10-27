

import { ToppingFormPage } from '@/components/superadmin/topping-form';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getToppingGroups, getToppingProducts } from '@/app/superadmin/toppings/actions';
import { getBrands } from '@/app/superadmin/brands/actions';

export default async function NewToppingPage({ searchParams }: { searchParams: Promise<{ groupId?: string }> }) {
    const { groupId } = await searchParams;
    const [locations, allGroups, brands, products] = await Promise.all([
        getAllLocations(),
        getToppingGroups(),
        getBrands(),
        getToppingProducts()
    ]);
    
    return (
        <ToppingFormPage 
            locations={locations} 
            allGroups={allGroups}
            brands={brands}
            products={products}
            initialGroupId={groupId}
        />
    );
}


