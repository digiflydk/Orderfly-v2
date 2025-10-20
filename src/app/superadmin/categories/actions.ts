

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, where, getDoc, writeBatch } from 'firebase/firestore';
import type { Category, Location } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';

const categorySchema = z.object({
  id: z.string().optional(),
  brandId: z.string().min(1, 'A primary brand must be selected.'), // For validation, not storage
  locationIds: z.array(z.string()).min(1, { message: 'At least one location must be selected.' }),
  categoryName: z.string().min(2, { message: 'Category name must be at least 2 characters.' }),
  description: z.string().optional(),
  isActive: z.boolean().default(false),
  sortOrder: z.coerce.number().optional(),
  icon: z.string().optional(),
});

export type FormState = {
  message: string;
  error: boolean;
};

export async function createOrUpdateCategory(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  const rawData: Record<string, any> = Object.fromEntries(formData.entries());
  
  const locationIds = formData.getAll('locationIds');
  rawData.locationIds = Array.isArray(locationIds) ? locationIds : [locationIds].filter(Boolean);

  rawData.isActive = formData.has('isActive');

  // We need brandId for validation, but we don't store it on the category document anymore.
  // The form should provide a brandId to satisfy the schema.
  if (!rawData.brandId) {
    const firstLocationId = rawData.locationIds[0];
    if (firstLocationId) {
        const locSnap = await getDoc(doc(db, 'locations', firstLocationId));
        if (locSnap.exists()) {
            rawData.brandId = (locSnap.data() as Location).brandId;
        }
    }
  }

  const validatedFields = categorySchema.safeParse(rawData);

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

  const { id, brandId, ...categoryData } = validatedFields.data;

  try {
    const categoryRef = id ? doc(db, 'categories', id) : doc(collection(db, 'categories'));
    // The 'brandId' is implicitly defined by the locations and is not saved on the category document itself.
    await setDoc(categoryRef, { ...categoryData, id: categoryRef.id }, { merge: true });

  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save category: ${errorMessage}`, error: true };
  }

  revalidatePath('/superadmin/categories');
  redirect('/superadmin/categories');
}

export async function deleteCategory(categoryId: string) {
    try {
        await deleteDoc(doc(db, "categories", categoryId));
        revalidatePath("/superadmin/categories");
        return { message: "Category deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete category: ${errorMessage}`, error: true };
    }
}

export async function updateCategorySortOrder(orderedCategories: {id: string, sortOrder: number}[]) {
    try {
        const batch = writeBatch(db);
        orderedCategories.forEach(category => {
            const docRef = doc(db, 'categories', category.id);
            batch.update(docRef, { sortOrder: category.sortOrder });
        });
        await batch.commit();
        revalidatePath('/superadmin/categories');
        return { message: 'Category order updated.', error: false };
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to update category order: ${errorMessage}`, error: true };
    }
}

export async function getCategoriesForLocation(locationId: string): Promise<Category[]> {
    const q = query(
        collection(db, 'categories'),
        where('locationIds', 'array-contains', locationId),
        where('isActive', '==', true)
    );
    const querySnapshot = await getDocs(q);
    const categories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Category[];
    
    return categories.sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999));
}

export async function getCategories(brandId?: string): Promise<Category[]> {
    let q;
    // Note: Fetching all categories and filtering on the client now,
    // as a category can span multiple brands via its locations.
    q = query(collection(db, 'categories'), orderBy('categoryName', 'asc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Category[];
}

export async function getCategoryById(id: string): Promise<Category | null> {
    const docRef = doc(db, 'categories', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return { id: docSnap.id, ...data } as Category;
    }
    return null;
}
