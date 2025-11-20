

import { FoodCategoriesClientPage } from '@/components/superadmin/food-category-client-page';
import { getFoodCategories } from './actions';

export default async function FoodCategoriesPage() {
  const categories = await getFoodCategories();

  return (
    <FoodCategoriesClientPage initialCategories={categories} />
  );
}
