

import { BrandFormPage } from '@/components/superadmin/brand-form-page';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { getSubscriptionPlans } from '@/app/superadmin/subscriptions/actions';
import { getUsers } from '@/app/superadmin/users/actions';
import { notFound } from 'next/navigation';
import { getFoodCategories } from '@/app/superadmin/food-categories/actions';

export default async function EditBrandPage({ params }: { params: { brandId: string }}) {
    const [brand, foodCategories, plans, users] = await Promise.all([
        getBrandById(params.brandId),
        getFoodCategories(),
        getSubscriptionPlans(),
        getUsers(),
    ]);

    if (!brand) {
        notFound();
    }

    // Use a key to force re-mounting of the client component when the brandId changes
    // This helps reset state correctly, especially for react-hook-form
    return (
        <BrandFormPage
            key={params.brandId} 
            brand={brand}
            foodCategories={foodCategories}
            plans={plans}
            users={users}
        />
    );
}
