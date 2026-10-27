

import { notFound } from 'next/navigation';
import { getToppingById, getToppingGroups, getToppingProducts } from '@/app/superadmin/toppings/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { ToppingFormPage } from '@/components/superadmin/topping-form';
import { getBrands } from '@/app/superadmin/brands/actions';


export default async function EditToppingPage({ params }: { params: Promise<{ toppingId: string }> }) {
    const { toppingId } = await params;
    
    if (!toppingId) {
        notFound();
    }

    const [topping, locations, allGroups, brands, products] = await Promise.all([
        getToppingById(toppingId),
        getAllLocations(),
        getToppingGroups(),
        getBrands(),
        getToppingProducts()
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
            products={products}
        />
    );
}

