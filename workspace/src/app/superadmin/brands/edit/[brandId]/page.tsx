
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import { BrandFormPage } from '@/components/superadmin/brand-form-page';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { getSubscriptionPlans } from '@/app/superadmin/subscriptions/page';
import { getUsers } from '@/app/superadmin/users/actions';
import { notFound } from 'next/navigation';
import { getFoodCategories } from '@/app/superadmin/food-categories/actions';

export default async function Page({ params, searchParams }: AsyncPageProps<{ brandId: string }>) {
    const routeParams = await resolveParams(params);
    const query = await resolveSearchParams(searchParams);

    const [brand, foodCategories, plans, users] = await Promise.all([
        getBrandById(routeParams.brandId),
        getFoodCategories(),
        getSubscriptionPlans(),
        getUsers(),
    ]);

    if (!brand) {
        notFound();
    }

    return (
        <BrandFormPage
            key={routeParams.brandId} 
            brand={brand}
            foodCategories={foodCategories}
            plans={plans}
            users={users}
        />
    );
}
