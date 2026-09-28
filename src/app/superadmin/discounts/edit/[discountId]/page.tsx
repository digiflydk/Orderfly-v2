

import { notFound } from 'next/navigation';
import { getDiscountById } from '@/app/superadmin/discounts/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { DiscountFormPage } from '@/components/superadmin/discount-form-page';
import { upsellClientData } from '@/lib/upsell-serialization';
import { loadSuperadminPage } from '@/lib/access/superadmin-page';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';


export default async function EditDiscountPage({ params }: { params: Promise<{ discountId: string }> }) {
    const { discountId } = await params;
    const result = await loadSuperadminPage('orderfly.discounts:view', () => Promise.all([
        getDiscountById(discountId),
        getBrands(),
        getAllLocations(),
    ]));
    if (!result) return <AccessDeniedPage />;
    const [discount, brands, locations] = result;

    if (!discount) {
        notFound();
    }

    return (
        <DiscountFormPage 
            discount={upsellClientData(discount)}
            brands={upsellClientData(brands)}
            locations={upsellClientData(locations)}

        />
    );
}
