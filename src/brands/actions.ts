

'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { getAdminDb } from '@/lib/firebase-admin';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, where, getDoc } from 'firebase/firestore';
import type { Brand, FoodCategory, Allergen, BrandAppearances } from '@/types';

const appearancesSchema = z.object({
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    background: z.string(),
    text: z.string(),
    border: z.string(),
    buttonText: z.string(),
  }),
  typography: z.object({
    fontFamily: z.string(),
  }),
});

const brandSchema = z.object({
  id: z.string().optional(),
  
  // Step 1: User Info
  ownerName: z.string().min(2, 'Owner name is required.'),
  ownerEmail: z.string().email('A valid email for the owner is required.'),

  // Step 2: Brand Info
  companyName: z.string().min(2, 'Company name is required.'),
  name: z.string().min(2, 'Brand name must be at least 2 characters.'),
  slug: z.string().min(2, 'Brand slug is required.').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug can only contain lowercase letters, numbers, and hyphens.'),
  street: z.string().min(2, 'Street name is required.'),
  zipCode: z.string().min(2, 'PO Box / ZIP Code is required.'),
  city: z.string().min(2, 'City is required.'),
  country: z.string().min(2, 'Country is required.'),
  currency: z.string().min(3, 'Currency is required.'),
  companyRegNo: z.string().regex(/^\d{8}$/, 'Company Registration No. must be an 8-digit number.'),
  
  // Step 3: Plan & Details
  subscriptionPlanId: z.string().optional(),
  foodCategories: z.array(z.string()).optional().default([]),
  locationsCount: z.coerce.number().min(1, 'Number of locations is required.'),

  status: z.enum(['active', 'suspended', 'pending', 'trialing']),

  // New optional fields
  logoUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  supportEmail: z.string().email({ message: "Please enter a valid email." }).optional().or(z.literal('')),
  website: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  termsUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  privacyUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  cookiesUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  offersHeading: z.string().optional().or(z.literal('')),
  combosHeading: z.string().optional().or(z.literal('')),

  // Fees & VAT
  bagFee: z.coerce.number().min(0).optional(),
  adminFeeType: z.enum(['fixed', 'percentage']).optional(),
  adminFee: z.coerce.number().min(0).optional(),
  vatPercentage: z.coerce.number().min(0).max(100).optional(),

   // Analytics overrides
  ga4MeasurementId: z.string().optional(),
  gtmContainerId: z.string().optional(),

  // Appearances is handled by its own form
  appearances: z.any().optional(),
});

export type FormState = {
  message: string;
  error: boolean;
};

export async function createOrUpdateBrand(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {

  const rawData: Record<string, any> = Object.fromEntries(formData.entries());
  rawData.foodCategories = formData.getAll('foodCategories');
  rawData.locationsCount = parseInt(rawData.locationsCount, 10);
  
  const validatedFields = brandSchema.safeParse(rawData);

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

  const { id, ownerName, ownerEmail, companyRegNo, slug, ...brandData } = validatedFields.data;
  
  try {
    const db = getAdminDb();
    // Check for unique company registration number
    let companyRegQuerySnapshot = await db.collection('brands').where('companyRegNo', '==', companyRegNo).get();
    
    if (!companyRegQuerySnapshot.empty) {
        const existingBrandDoc = companyRegQuerySnapshot.docs[0];
        if (existingBrandDoc.id !== id) {
            return {
                message: 'This Company Registration Number is already in use by another brand.',
                error: true
            };
        }
    }
    
    // Check for unique slug
    let slugQuerySnapshot = await db.collection('brands').where('slug', '==', slug).get();
    if (!slugQuerySnapshot.empty) {
        const existingBrandDoc = slugQuerySnapshot.docs[0];
        if (existingBrandDoc.id !== id) {
            return {
                message: 'This brand slug is already in use. Please choose another.',
                error: true
            };
        }
    }

    let ownerId: string;

    if (id) {
      // For updates, we assume the owner doesn't change via this form.
      const brandDoc = await db.collection('brands').doc(id).get();
      const existingBrand = brandDoc.data() as Brand;
      ownerId = existingBrand.ownerId;
      
      const brandRef = db.collection('brands').doc(id);
      await brandRef.update({ ...brandData, companyRegNo, slug, ownerId });

    } else {
      // Create new user first
      const newUserRef = db.collection('users').doc();
      await newUserRef.set({ 
        id: newUserRef.id,
        name: ownerName, 
        email: ownerEmail, 
        isSuperAdmin: false 
      });
      ownerId = newUserRef.id;

      // Then create the new brand, linking it to the new user
      const newBrandRef = db.collection('brands').doc();
      await newBrandRef.set({ ...brandData, companyRegNo, slug, id: newBrandRef.id, ownerId });
    }

  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save brand: ${errorMessage}`, error: true };
  }

  revalidatePath('/superadmin/brands');
  revalidatePath('/superadmin/users');
  redirect('/superadmin/brands');
}


export async function deleteBrand(brandId: string) {
    try {
        const db = getAdminDb();
        await db.collection("brands").doc(brandId).delete();
        revalidatePath("/superadmin/brands");
        return { message: "Brand deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete brand: ${errorMessage}`, error: true };
    }
}

export async function getAllergens(): Promise<Allergen[]> {
    const db = getAdminDb();
    const q = db.collection('allergens').orderBy('allergenName');
    const querySnapshot = await q.get();
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Allergen[];
}

export async function getBrandById(brandId: string): Promise<Brand | null> {
    const db = getAdminDb();
    const docRef = db.collection('brands').doc(brandId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        const data = docSnap.data();
        return { id: docSnap.id, ...data } as Brand;
    }
    return null;
}

export async function getBrandBySlug(brandSlug?: string): Promise<Brand | null> {
    if (!brandSlug) {
      return null;
    }
    const db = getAdminDb();
    const q = db.collection('brands').where('slug', '==', brandSlug);
    const querySnapshot = await q.get();
    if (querySnapshot.empty) {
        return null;
    }
    const data = querySnapshot.docs[0].data();
    return { id: querySnapshot.docs[0].id, ...data } as Brand;
}

export async function getBrands(): Promise<Brand[]> {
  const db = getAdminDb();
  const q = db.collection('brands').orderBy('name');
  const querySnapshot = await q.get();
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Brand[];
}

export async function updateBrandAppearances(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  try {
    const brandId = formData.get('brandId') as string;
    const appearancesJSON = formData.get('appearances') as string;
    const appearances = JSON.parse(appearancesJSON) as BrandAppearances;

    if (!brandId || !appearances) {
      return { message: 'Missing brand ID or appearance data.', error: true };
    }

    const validatedFields = appearancesSchema.safeParse(appearances);

    if (!validatedFields.success) {
      return { message: 'Invalid appearance data.', error: true };
    }
    
    const db = getAdminDb();
    const brandRef = db.collection('brands').doc(brandId);
    await brandRef.update({ appearances: validatedFields.data });
    
    revalidatePath(`/superadmin/brands/edit/${brandId}`);
    return { message: 'Appearance settings updated.', error: false };

  } catch(e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to update appearances: ${errorMessage}`, error: true };
  }
}
