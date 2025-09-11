

import { notFound } from 'next/navigation';
import { getComboById } from '@/app/superadmin/combos/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { ComboFormPage } from '@/components/superadmin/combo-form-page';
import { getAllLocations } from '@/app/superadmin/locations/actions';

export default async function EditComboPage({ params }: { params: { comboId: string } }) {
    const [combo, brands, locations] = await Promise.all([
        getComboById(params.comboId),
        getBrands(),
        getAllLocations()
    ]);

    if (!combo) {
        notFound();
    }

    return (
        <ComboFormPage combo={combo} brands={brands} locations={locations} />
    );
}
