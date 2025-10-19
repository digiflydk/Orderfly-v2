
import { LocationFormPage } from '@/components/superadmin/location-form-page';
import { getLocationById } from '@/app/superadmin/locations/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { notFound } from 'next/navigation';

export default async function EditLocationPage({ params }: { params: Promise<{ locationId: string }> }) {
    const { locationId } = await params;
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
