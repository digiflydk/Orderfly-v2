

import { notFound } from 'next/navigation';
import { getToppingById, getToppingGroups } from '@/app/superadmin/toppings/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { ToppingFormPage } from '@/components/superadmin/topping-form';
import { getBrands } from '@/app/superadmin/brands/actions';


export default async function EditToppingPage({ params }: { params: { toppingId: string } }) {
    if (!params.toppingId) {
        notFound();
    }

    const [topping, locations, allGroups, brands] = await Promise.all([
        getToppingById(params.toppingId),
        getAllLocations(),
        getToppingGroups(),
        getBrands()
    ]);
    
    if (!topping) {
        notFound();
    }
    
    return (
        <ToppingFormPage
            topping={topping}
            locations={locations}
            allGroups={allGroups}
            brands={brands}
        />
    );
}

