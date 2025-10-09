
import { CategoryFormPage } from '@/components/superadmin/category-form-page';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getBrands } from '@/app/superadmin/brands/actions';

export default async function NewCategoryPage() {
    const [locations, brands] = await Promise.all([
        getAllLocations(),
        getBrands()
    ]);
    
    return (
        <CategoryFormPage
            locations={locations}
            brands={brands}
        />
    );
}
