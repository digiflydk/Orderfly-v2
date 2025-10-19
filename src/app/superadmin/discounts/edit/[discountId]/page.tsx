

import { notFound } from 'next/navigation';
import { getDiscountById } from '@/app/superadmin/discounts/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { DiscountFormPage } from '@/components/superadmin/discount-form-page';
import { getUsers } from '@/app/superadmin/users/actions';

export default async function EditDiscountPage({ params }: { params: Promise<{ discountId: string }> }) {
    const { discountId } = await params;
    const [discount, brands, locations, users] = await Promise.all([
        getDiscountById(discountId),
        getBrands(),
        getAllLocations(),
        getUsers(),
    ]);

    if (!discount) {
        notFound();
    }

    return (
        <DiscountFormPage 
            discount={discount} 
            brands={brands} 
            locations={locations}
            users={users}
        />
    );
}
