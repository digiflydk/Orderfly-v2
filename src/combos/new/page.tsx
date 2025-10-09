

import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { ComboFormPage } from '@/components/superadmin/combo-form-page';

export default async function NewComboPage() {
    const [brands, locations] = await Promise.all([
        getBrands(),
        getAllLocations()
    ]);
    
    return (
        <ComboFormPage brands={brands} locations={locations} />
    );
}
