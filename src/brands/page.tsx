

import { getBrands } from './actions';
import type { Brand, SubscriptionPlan, User } from '@/types';
import { getSubscriptionPlans } from '@/app/superadmin/subscriptions/actions';
import { getUsers } from '@/app/superadmin/users/actions';
import { BrandsClientPage } from './client-page';

export default async function BrandsPage() {
  const [brands, users, plans] = await Promise.all([
      getBrands(),
      getUsers(),
      getSubscriptionPlans(),
  ]);

  // This mapping is for display purposes, as we are fetching all data here.
  const brandsWithDetails = brands.map(brand => ({
      ...brand,
      ownerName: users.find(u => u.id === brand.ownerId)?.name || 'N/A',
      planName: plans.find(p => p.id === brand.subscriptionPlanId)?.name || 'N/A',
  }));

  return (
    <BrandsClientPage
        initialBrands={brandsWithDetails}
    />
  );
}
