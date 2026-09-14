

'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { getAdminDb } from '@/lib/firebase-admin';
import { getLocationCatalogDocument, listLocationCatalog, mutateLocationCatalog, reorderLocationCatalog } from '@/lib/access/location-catalog';

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
  await verifiedOrderflyIdentity();
  const rawData: Record<string, any> = Object.fromEntries(formData.entries());

  const locationIds = formData.getAll('locationIds');
  rawData.locationIds = Array.isArray(locationIds) ? locationIds : [locationIds].filter(Boolean);

  rawData.isActive = formData.has('isActive');

  // We need brandId for validation, but we don't store it on the category document anymore.
  // The form should provide a brandId to satisfy the schema.
  if (!rawData.brandId) {
    const firstLocationId = rawData.locationIds[0];
    if (typeof firstLocationId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(firstLocationId)) {
        const locSnap = await getAdminDb().collection('locations').doc(firstLocationId).get();
        if (locSnap.exists) {
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
    const categoryId=id||getAdminDb().collection('categories').doc().id;
    await mutateLocationCatalog('categories',categoryId,id?'orderfly.catalog:edit':'orderfly.catalog:create',before=>({...before,...categoryData,id:categoryId}));

  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save category: ${errorMessage}`, error: true };
  }

  revalidatePath('/superadmin/categories');
    revalidateTag('storefront');
  redirect('/superadmin/categories');
}

export async function deleteCategory(categoryId: string) {
    try {
        await mutateLocationCatalog('categories',categoryId,'orderfly.catalog:delete',()=>null);
        revalidatePath("/superadmin/categories");
    revalidateTag('storefront');
        return { message: "Category deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete category: ${errorMessage}`, error: true };
    }
}

export async function updateCategorySortOrder(orderedCategories: {id: string, sortOrder: number}[]) {
    try {
        await reorderLocationCatalog('categories',orderedCategories);
        revalidatePath('/superadmin/categories');
    revalidateTag('storefront');
        return { message: 'Category order updated.', error: false };
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to update category order: ${errorMessage}`, error: true };
    }
}

export async function getCategoriesForLocation(locationId: string): Promise<Category[]> {
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(locationId))return [];
    const db=getAdminDb(),location=await db.collection('locations').doc(locationId).get();
    if(!location.exists||location.data()?.isActive!==true)return [];
    const querySnapshot=await db.collection('categories').where('locationIds','array-contains',locationId).where('isActive','==',true).get();
    return querySnapshot.docs.map(doc=>{
      const data=doc.data();return {id:doc.id,brandId:location.data()!.brandId,categoryName:data.categoryName,description:data.description||'',icon:data.icon||'',sortOrder:data.sortOrder??999,isActive:true,locationIds:[locationId]} as Category;
    }).sort((a,b)=>(a.sortOrder??999)-(b.sortOrder??999));
}
export async function getCategories(brandId?: string): Promise<Category[]> {
    return (await listLocationCatalog('categories',brandId) as Category[]).sort((a,b)=>a.categoryName.localeCompare(b.categoryName));
}
export async function getCategoryById(id: string): Promise<Category | null> {
    return await getLocationCatalogDocument('categories',id) as Category|null;
}
