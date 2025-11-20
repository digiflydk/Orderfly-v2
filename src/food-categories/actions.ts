

'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy } from 'firebase/firestore';
import type { FoodCategory } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';

const foodCategorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, { message: 'Category name must be at least 2 characters.' }),
  description: z.string().optional(),
});

export type FormState = {
  message: string;
  error: boolean;
};

export async function createOrUpdateFoodCategory(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = foodCategorySchema.safeParse(rawData);

  if (!validatedFields.success) {
    console.error(validatedFields.error.flatten());
    const errorMessages = Object.entries(validatedFields.error.flatten().fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
    return {
      message: 'Validation failed: ' + errorMessages,
      error: true,
    };
  }

  const { id, ...categoryData } = validatedFields.data;
  const db = getAdminDb();

  try {
    const categoryRef = id ? doc(db, 'food_categories', id) : doc(collection(db, 'food_categories'));
    await setDoc(categoryRef, { ...categoryData, id: categoryRef.id }, { merge: true });

  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save category: ${errorMessage}`, error: true };
  }
  
  revalidatePath('/superadmin/food-categories');
  redirect('/superadmin/food-categories');
}

export async function deleteFoodCategory(categoryId: string) {
    try {
        const db = getAdminDb();
        await deleteDoc(doc(db, "food_categories", categoryId));
        revalidatePath("/superadmin/food-categories");
        return { message: "Food Category deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete category: ${errorMessage}`, error: true };
    }
}

export async function getFoodCategories(): Promise<FoodCategory[]> {
  const db = getAdminDb();
  const q = query(collection(db, 'food_categories'), orderBy('name'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as FoodCategory[];
}
