

import { notFound } from 'next/navigation';
import { getComboById } from '@/app/superadmin/combos/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { ComboFormPage } from '@/components/superadmin/combo-form-page';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { loadSuperadminPage } from '@/lib/access/superadmin-page';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';

export default async function EditComboPage({ params }: { params: Promise<{ comboId: string }> }) {
    const { comboId } = await params;
    const result = await loadSuperadminPage('orderfly.catalog:view', () => Promise.all([
        getComboById(comboId),
        getBrands(),
        getAllLocations()
    ]));
    if (!result) return <AccessDeniedPage />;
    const [combo, brands, locations] = result;

    if (!combo) {
        notFound();
    }

    return (
        <ComboFormPage combo={combo} brands={brands} locations={locations} />
    );
}
