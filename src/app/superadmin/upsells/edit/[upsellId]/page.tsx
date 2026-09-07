

import { notFound } from 'next/navigation';
import { upsellClientData } from '@/lib/upsell-serialization';
import { getUpsellById } from '@/app/superadmin/upsells/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { UpsellFormPage } from '@/components/superadmin/upsell-form-page';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getProducts } from '@/app/superadmin/products/actions';
import { getCategories } from '@/app/superadmin/categories/actions';

export default async function EditUpsellPage({ params }: { params: Promise<{ upsellId: string }> }) {
    const { upsellId } = await params;
    const [upsell, brands, locations, products, categories] = await Promise.all([
        getUpsellById(upsellId),
        getBrands(),
        getAllLocations(),
        getProducts(),
        getCategories(),
    ]);

    if (!upsell) {
        notFound();
    }

    return (
        <UpsellFormPage 
            upsell={upsell} 
            brands={upsellClientData(brands)}
            locations={upsellClientData(locations)}
            products={upsellClientData(products)}
            categories={upsellClientData(categories)}
        />
    );
}
