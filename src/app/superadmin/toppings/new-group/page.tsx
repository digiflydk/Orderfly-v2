
import { ToppingGroupFormPage } from '@/components/superadmin/topping-group-form-page';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getBrands } from '@/app/superadmin/brands/actions';

export default async function NewToppingGroupPage() {
    const [locations, brands] = await Promise.all([
        getAllLocations(),
        getBrands()
    ]);
    
    return (
        <ToppingGroupFormPage locations={locations} brands={brands} />
    );
}
