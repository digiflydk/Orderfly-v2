

'use server';
import { mpanelAdminEnabled } from '@/lib/mpanel-admin-cutover';

import 'server-only';

import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import type { Brand, FoodCategory, Allergen, BrandAppearances } from '@/types';
import { brandRecord } from '@/lib/brand-record';
import { hasPermission } from '@/lib/permissions';

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
  ownerId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
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
  supportEmail: z.string().email().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  termsUrl: z.string().url().optional().or(z.literal('')),
  privacyUrl: z.string().url().optional().or(z.literal('')),
  cookiesUrl: z.string().url().optional().or(z.literal('')),
  offersHeading: z.string().optional().or(z.literal('')),
  combosHeading: z.string().optional().or(z.literal('')),

  // Fees & VAT
  bagFee: z.coerce.number().min(0).optional(),
  adminFeeType: z.enum(['fixed', 'percentage']).optional(),
  adminFee: z.coerce.number().min(0).optional(),
  vatPercentage: z.coerce.number().min(0).max(100).optional(),

   // Analytics overrides
  ga4MeasurementId: z.string().regex(/^G-[A-Z0-9]+$/).optional().or(z.literal('')),
  gtmContainerId: z.string().regex(/^GTM-[A-Z0-9]+$/).optional().or(z.literal('')),
  googleAdsConversionId: z.string().regex(/^AW-\d+$/).optional().or(z.literal('')),
  googleAdsPurchaseLabel: z.string().max(100).optional().or(z.literal('')),
  metaPixelId: z.string().regex(/^\d{5,30}$/).optional().or(z.literal('')),

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

  if (!hasPermission(formData.get('id') ? 'brands:edit' : 'brands:create')) {
    return { message: 'Du har ikke adgang til at gemme dette brand.', error: true };
  }

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

  const { id, ownerId: requestedOwnerId, ownerName, ownerEmail, companyRegNo, slug, ...brandData } = validatedFields.data;
  
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

    if (mpanelAdminEnabled()) {
      // Serialize reference changes with central catalog deletions.
      const brandRef = id ? db.collection('brands').doc(id) : db.collection('brands').doc();
      await db.runTransaction(async tx => {
        const lock = db.collection('platformAdminControl').doc('catalog');
        await tx.get(lock);
        const existing = id ? await tx.get(brandRef) : null;
        if (id && !existing?.exists) throw new Error('Brandet findes ikke længere.');
        let selectedOwnerId = existing?.data()?.ownerId;
        if (!id) selectedOwnerId = requestedOwnerId;
        if (!selectedOwnerId || !(await tx.get(db.collection('users').doc(selectedOwnerId))).exists) throw new Error('Ejeren findes ikke i mPanel.');
        if (brandData.subscriptionPlanId && !(await tx.get(db.collection('subscription_plans').doc(brandData.subscriptionPlanId))).exists) throw new Error('Abonnementsplanen findes ikke længere.');
        tx.set(brandRef, {...brandData, companyRegNo, slug, id:brandRef.id, ownerId:selectedOwnerId}, {merge:true});
        tx.set(lock, {lastBrandId:brandRef.id});
      });
    } else if (id) {
      // For updates, we assume the owner doesn't change via this form.
      const brandDoc = await db.collection('brands').doc(id).get();
      if (!brandDoc.exists) {
        return { message: 'Brandet findes ikke længere. Genindlæs brandoversigten.', error: true };
      }
      const existingBrand = brandDoc.data() as Brand;
      ownerId = existingBrand.ownerId;
      
      const brandRef = db.collection('brands').doc(id);
      await brandRef.update({ ...brandData, companyRegNo, slug });

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
  revalidatePath('/superadmin/locations', 'layout');
    revalidateTag('storefront');
  revalidatePath('/superadmin/users');
    revalidateTag('storefront');
  redirect('/superadmin/brands');
}


export async function deleteBrand(brandId: string) {
    try {
        const db = getAdminDb();
        await db.collection("brands").doc(brandId).delete();
        revalidatePath("/superadmin/brands");
    revalidateTag('storefront');
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
        return brandRecord(docSnap.id, data || {});
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
    return brandRecord(querySnapshot.docs[0].id, data);
}

export async function getBrands(): Promise<Brand[]> {
  const db = getAdminDb();
  // Firestore orderBy('name') omits records where name is missing entirely.
  const querySnapshot = await db.collection('brands').get();
  return querySnapshot.docs.map(doc => brandRecord(doc.id, doc.data()))
    .sort((a, b) => a.name.localeCompare(b.name, 'da'));
}

export async function updateBrandAppearances(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  try {
    const brandId = formData.get('brandId') as string;
    const appearancesJSON = formData.get('appearances') as string;
    const appearances = JSON.parse(appearancesJSON) as BrandAppearances;
    const db = getAdminDb();

    if (!brandId || !appearances) {
      return { message: 'Missing brand ID or appearance data.', error: true };
    }

    const validatedFields = appearancesSchema.safeParse(appearances);

    if (!validatedFields.success) {
      return { message: 'Invalid appearance data.', error: true };
    }
    
    const brandRef = db.collection('brands').doc(brandId);
    await brandRef.update({ appearances: validatedFields.data });
    
    revalidatePath(`/superadmin/brands/edit/${brandId}`);
    revalidateTag('storefront');
    return { message: 'Appearance settings updated.', error: false };

  } catch(e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to update appearances: ${errorMessage}`, error: true };
  }
}
