
import { getFoodCategories } from './actions';
import { FoodCategoriesClientPage } from './client-page';

export default async function FoodCategoriesPage() {
  const categories = await getFoodCategories();

  return (
    <FoodCategoriesClientPage initialCategories={categories} />
  );
}
