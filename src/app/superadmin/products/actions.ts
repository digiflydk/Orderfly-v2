
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Product, ProductForMenu } from '@/types';
import * as admin from 'firebase-admin';

const asBool = (v: unknown) => {
  if (v === true || v === false) return v;
  if (v == null) return undefined;
  const s = String(v).toLowerCase().trim();
  return ['1', 'true', 'on', 'yes', 'checked'].includes(s);
};

const baseFields = {
  id: z.string().optional().nullable(),
  brandId: z.string().min(1, 'A brand must be selected.'),
  locationIds: z.array(z.string()).optional().default([]),
  categoryId: z.string().min(1, 'A category must be selected.'),
  productName: z.string().min(2, 'Product name must be at least 2 characters.'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'Price must be a non-negative number.'),
  priceDelivery: z.coerce.number().min(0, 'Delivery price must be a non-negative number.').optional(),
  allergenIds: z.array(z.string()).optional().default([]),
  toppingGroupIds: z.array(z.string()).optional().default([]),
  imageUrl: z.any().optional(),
};

const createSchema = z.object({
  ...baseFields,
  isActive: z.preprocess(asBool, z.boolean()).optional().default(false),
  isFeatured: z.preprocess(asBool, z.boolean()).optional().default(false),
  isNew: z.preprocess(asBool, z.boolean()).optional().default(false),
  isPopular: z.preprocess(asBool, z.boolean()).optional().default(false),
});

const updateSchema = z.object({
  ...baseFields,
  isActive: z.preprocess(asBool, z.boolean()).optional(),
  isFeatured: z.preprocess(asBool, z.boolean()).optional(),
  isNew: z.preprocess(asBool, z.boolean()).optional(),
  isPopular: z.preprocess(asBool, z.boolean()).optional(),
});


type ActionOk = { ok: true; id: string };
type ActionErr = { ok: false; error: { message: string, code?: string, detail?: string } };
export type FormState = ActionOk | ActionErr | null;


export async function createOrUpdateProduct(prevState: FormState | null, formData: FormData): Promise<FormState> {
    const id = formData.get('id')?.toString();
    const schema = id ? updateSchema : createSchema;
    const db = getAdminDb();
    
    const rawData: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      if (key.endsWith('[]')) {
        const arrayKey = key.slice(0, -2);

        if (rawData[arrayKey] == null) {
          rawData[arrayKey] = [];
        } else if (!Array.isArray(rawData[arrayKey])) {
          rawData[arrayKey] = [String(rawData[arrayKey])].filter(Boolean);
        }

        (rawData[arrayKey] as string[]).push(typeof value === 'string' ? value : String(value));
      } else {
        if (rawData[key] === undefined) {
          rawData[key] = value;
        } else if (Array.isArray(rawData[key])) {
          (rawData[key] as string[]).push(typeof value === 'string' ? value : String(value));
        } else {
          rawData[key] = [String(rawData[key]), typeof value === 'string' ? value : String(value)];
        }
      }
    }
    
    const parsed = schema.safeParse(rawData);

    if (!parsed.success) {
      const flatErrors = parsed.error.flatten();
      const errorMessages = Object.entries(flatErrors.fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
      return {
        ok: false,
        error: { message: `Validation failed: ${errorMessages}`, detail: JSON.stringify(flatErrors) },
      };
    }
    
    const { id: validatedId, ...productData } = parsed.data;
    
    // For updates, filter out undefined values to prevent overwriting existing data.
    const toWrite: Partial<Product> = id
      ? Object.fromEntries(Object.entries(productData).filter(([, v]) => v !== undefined))
      : productData;

    // quick sanity before DB (helps catch type issues early)
    const sanity = {
        price: typeof (toWrite as any).price,
        isActive: typeof (toWrite as any).isActive,
        locationIdsIsArray: Array.isArray((toWrite as any).locationIds),
    };
    if (sanity.price !== 'number' || Number.isNaN((toWrite as any).price)) {
        return { ok: false, error: { message: 'Invalid price', detail: 'Price must be a number.' } };
    }
    if ((toWrite as any).isActive !== undefined && sanity.isActive !== 'boolean') {
        return { ok: false, error: { message: 'Invalid isActive', detail: 'Must be boolean.' } };
    }
    if ((toWrite as any).locationIds && !sanity.locationIdsIsArray) {
        return { ok: false, error: { message: 'Invalid locationIds', detail: 'Must be string[]' } };
    }
  
    try {
      const imageFileOrUrl = formData.get('imageUrl');

      if (imageFileOrUrl instanceof File && imageFileOrUrl.size > 0) {
        // Placeholder for Firebase Storage upload logic
        console.warn('Image upload is not yet implemented. Saving placeholder URL.');
        toWrite.imageUrl = `https://picsum.photos/seed/${imageFileOrUrl.name}/400/300`;
      } else if (typeof imageFileOrUrl === 'string') {
        toWrite.imageUrl = imageFileOrUrl;
      } else if (validatedId) {
        const existingProduct = await getProductById(validatedId);
        toWrite.imageUrl = existingProduct?.imageUrl;
      } else {
        toWrite.imageUrl = undefined;
      }

      const now = new Date();

      if (id) {
        await db.collection('products').doc(id).update({
          ...toWrite,
          updatedAt: now,
        });
        revalidatePath('/superadmin/products');
        return { ok: true, id };
      } else {
        const payload = {
          ...toWrite,
          isActive: (toWrite as any).isActive ?? false,
          createdAt: now,
          updatedAt: now,
        };
        const ref = await db.collection('products').add(payload);
        await db.collection('products').doc(ref.id).update({ id: ref.id });
        revalidatePath('/superadmin/products');
        return { ok: true, id: ref.id };
      }
  
    } catch (e: any) {
      console.error('[products.createOrUpdate] Firestore write failed', {
        message: e?.message,
        code: e?.code,
        stack: e?.stack,
      });
      return {
        ok: false,
        error: {
          message: 'Database write failed',
          code: e?.code ?? 'unknown',
          detail: e?.message ?? 'No details from Firestore',
        },
      };
    }
}


// --- OTHER ACTIONS ---

export async function deleteProduct(productId: string) {
    try {
        const db = getAdminDb();
        await db.collection("products").doc(productId).delete();
        revalidatePath("/superadmin/products");
        return { message: "Product deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete product: ${errorMessage}`, error: true };
    }
}

export async function updateProductSortOrder(orderedProducts: {id: string, sortOrder: number}[]) {
    try {
        const db = getAdminDb();
        const batch = db.batch();
        orderedProducts.forEach(product => {
            const docRef = db.collection('products').doc(product.id);
            batch.update(docRef, { sortOrder: product.sortOrder });
        });
        await batch.commit();
        revalidatePath('/superadmin/products');
        return { message: 'Product order updated.', error: false };
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to update product order: ${errorMessage}`, error: true };
    }
}

export async function getProducts(): Promise<Product[]> {
    const db = getAdminDb();
    const q = db.collection('products').orderBy('sortOrder', 'asc');
    const querySnapshot = await q.get();
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[];
}

export async function getProductById(productId: string): Promise<Product | null> {
    const db = getAdminDb();
    const docRef = db.collection('products').doc(productId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        return { id: docSnap.id, ...docSnap.data() } as Product;
    }
    return null;
}

export async function getProductsByIds(productIds: string[], brandId?: string): Promise<ProductForMenu[]> {
    if (!productIds || productIds.length === 0) return [];
    const db = getAdminDb();
    
    const productPromises: Promise<Product[]>[] = [];
    for (let i = 0; i < productIds.length; i += 30) {
        const chunk = productIds.slice(i, i + 30);
        let q: admin.firestore.Query = db.collection('products').where(admin.firestore.FieldPath.documentId(), 'in', chunk);
        if (brandId) {
            q = q.where('brandId', '==', brandId);
        }
        const p = q.get().then(snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
        productPromises.push(p);
    }
    
    const productArrays = await Promise.all(productPromises);
    const allProducts = productArrays.flat();

    const finalProducts: ProductForMenu[] = allProducts.map(p => ({
        id: p.id,
        productName: p.productName,
        description: p.description,
        price: p.price,
        priceDelivery: p.priceDelivery,
        imageUrl: p.imageUrl,
        isFeatured: p.isFeatured,
        isNew: p.isNew,
        isPopular: p.isPopular,
        allergenIds: p.allergenIds,
        toppingGroupIds: p.toppingGroupIds,
        categoryId: p.categoryId,
        brandId: p.brandId,
        sortOrder: p.sortOrder,
    }));
    
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[DEBUG] getProductsByIds:',
        finalProducts.map((p) => ({
          id: p.id,
          productName: p.productName,
          price: p.price,
          toppingGroups: p.toppingGroupIds?.length,
          imageSize: p.imageUrl?.length,
          fullSize: JSON.stringify(p).length
        }))
      );
    }
    
    return finalProducts;
}

export async function duplicateProducts({
  productIds,
  targetBrandId,
  targetLocationIds,
}: {
  productIds: string[];
  targetBrandId: string;
  targetLocationIds: string[];
}): Promise<{ success: boolean; message: string }> {
  if (!productIds || productIds.length === 0) {
    return { success: false, message: 'No products selected for duplication.' };
  }
  if (!targetBrandId) {
    return { success: false, message: 'Target brand must be selected.' };
  }
  const db = getAdminDb();
  try {
    const productsToDuplicate: Product[] = [];
    for (let i = 0; i < productIds.length; i += 30) {
      const chunk = productIds.slice(i, i + 30);
      const q = db.collection('products').where(admin.firestore.FieldPath.documentId(), 'in', chunk);
      const snapshot = await q.get();
      snapshot.forEach(doc => {
        productsToDuplicate.push({ id: doc.id, ...doc.data() } as Product);
      });
    }

    if (productsToDuplicate.length === 0) {
      return { success: false, message: 'Could not find the selected products to duplicate.' };
    }

    const batch = db.batch();
    let duplicatedCount = 0;

    for (const product of productsToDuplicate) {
      const newProductId = db.collection('products').doc().id;
      const { id, ...originalData } = product;
      
      const newProductData = {
        ...originalData,
        id: newProductId,
        brandId: targetBrandId,
        locationIds: targetLocationIds,
        productName: product.productName, 
        sortOrder: 9999,
      };
      
      batch.set(db.collection('products').doc(newProductId), newProductData);
      duplicatedCount++;
    }

    await batch.commit();
    revalidatePath('/superadmin/products');
    return { success: true, message: `${duplicatedCount} products duplicated successfully.` };
  } catch (e: any) {
    console.error('Failed to duplicate products:', e);
    return { success: false, message: `An error occurred: ${e.message}` };
  }
}
