

import { ProductFormPage } from '@/components/superadmin/product-form-page';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getCategories } from '@/app/superadmin/categories/actions';
import { getToppingGroups } from '@/app/superadmin/toppings/actions';
import { getAllergens } from '@/app/superadmin/allergens/actions';

export default async function NewProductPage() {
    const [
        brands,
        locations,
        categories,
        toppingGroups,
        allergens,
    ] = await Promise.all([
        getBrands(),
        getAllLocations(),
        getCategories(),
        getToppingGroups(),
        getAllergens(),
    ]);
    
    return (
        <ProductFormPage 
            brands={brands}
            locations={locations}
            categories={categories}
            toppingGroups={toppingGroups}
            allergens={allergens}
        />
    );
}
