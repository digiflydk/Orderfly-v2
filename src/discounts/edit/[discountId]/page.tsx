

import { notFound } from 'next/navigation';
import { getDiscountById } from '@/app/superadmin/discounts/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { DiscountFormPage } from '@/components/superadmin/discount-form-page';


export default async function EditDiscountPage({ params }: { params: { discountId: string } }) {
    const [discount, brands, locations] = await Promise.all([
        getDiscountById(params.discountId),
        getBrands(),
        getAllLocations(),

    ]);

    if (!discount) {
        notFound();
    }

    return (
        <DiscountFormPage 
            discount={discount} 
            brands={brands} 
            locations={locations}

        />
    );
}
