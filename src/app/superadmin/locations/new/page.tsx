
import { LocationFormPage } from '@/components/superadmin/location-form-page';
import { getBrands } from '@/app/superadmin/brands/actions';

export default async function NewLocationPage() {
    const brands = await getBrands();

    return (
        <LocationFormPage brands={brands} />
    );
}
