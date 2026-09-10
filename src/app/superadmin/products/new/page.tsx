

import { ProductFormPage } from '@/components/superadmin/product-form-page';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getCategories } from '@/app/superadmin/categories/actions';
import { getToppingGroups, getToppings } from '@/app/superadmin/toppings/actions';
import { getAllergens } from '@/app/superadmin/allergens/actions';
import { upsellClientData } from '@/lib/upsell-serialization';

export default async function NewProductPage() {
    const [
        brands,
        locations,
        categories,
        toppingGroups,
        toppings,
        allergens,
    ] = await Promise.all([
        getBrands(),
        getAllLocations(),
        getCategories(),
        getToppingGroups(),
        getToppings(),
        getAllergens(),
    ]);
    
    return (
        <ProductFormPage 
            {...upsellClientData({ brands, locations, categories, toppingGroups, toppings, allergens })}
        />
    );
}
