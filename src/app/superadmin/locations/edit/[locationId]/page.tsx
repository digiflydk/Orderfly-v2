

import { LocationFormPage } from '@/components/superadmin/location-form-page';
import { getLocationById } from '@/app/superadmin/locations/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { notFound } from 'next/navigation';
import type { AsyncPageProps } from '@/types/next-async-props';
import { resolveParams } from '@/lib/next/resolve-props';

export default async function EditLocationPage({ params }: AsyncPageProps<{ locationId: string }>) {
    const { locationId } = await resolveParams(params);
    const [location, brands] = await Promise.all([
        getLocationById(locationId),
        getBrands(),
    ]);

    if (!location) {
        notFound();
    }

    return (
        <LocationFormPage
            location={location}
            brands={brands}
        />
    );
}
