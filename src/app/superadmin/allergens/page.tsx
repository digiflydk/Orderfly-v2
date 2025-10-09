
import { getAllergens } from './actions';
import type { Allergen } from '@/types';
import { AllergensClientPage } from './client-page';

export default async function AllergensPage() {
  const allergens = await getAllergens();

  return (
    <AllergensClientPage initialAllergens={allergens} />
  );
}
