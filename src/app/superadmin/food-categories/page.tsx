
import { FoodCategoriesClientPage } from './client-page';
import { getFoodCategories } from './actions';

export default async function FoodCategoriesPage() {
  const categories = await getFoodCategories();

  return (
    <FoodCategoriesClientPage initialCategories={categories} />
  );
}
