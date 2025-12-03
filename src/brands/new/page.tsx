

import { BrandFormPage } from '@/components/superadmin/brand-form-page';
import { getSubscriptionPlans } from '@/app/superadmin/subscriptions/actions';
import { getUsers } from '@/app/superadmin/users/actions';
import { getFoodCategories } from '@/app/superadmin/food-categories/actions';

export default async function NewBrandPage() {
    const [foodCategories, plans, users] = await Promise.all([
        getFoodCategories(),
        getSubscriptionPlans(),
        getUsers()
    ]);

    return (
        <BrandFormPage
            foodCategories={foodCategories}
            plans={plans}
            users={users}
        />
    );
}
