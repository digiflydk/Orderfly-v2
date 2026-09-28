

import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { ComboFormPage } from '@/components/superadmin/combo-form-page';
import { loadSuperadminPage } from '@/lib/access/superadmin-page';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';

export default async function NewComboPage() {
    const result = await loadSuperadminPage('orderfly.catalog:view', () => Promise.all([
        getBrands(),
        getAllLocations()
    ]));
    if (!result) return <AccessDeniedPage />;
    const [brands, locations] = result;
    
    return (
        <ComboFormPage brands={brands} locations={locations} />
    );
}
