

'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
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
    const categoryRef = id ? db.collection('food_categories').doc(id) : db.collection('food_categories').doc();
    await categoryRef.set({ ...categoryData, id: categoryRef.id }, { merge: true });

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
        await db.collection("food_categories").doc(categoryId).delete();
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
  const q = db.collection('food_categories').orderBy('name');
  const querySnapshot = await q.get();
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as FoodCategory[];
}
