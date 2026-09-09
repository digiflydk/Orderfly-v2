
'use server';

import 'server-only';

import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { hasPermission } from '@/lib/permissions';
import { uploadProductImage } from '@/lib/superadmin/product-image-storage';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Product, ProductForMenu } from '@/types';
import * as admin from 'firebase-admin';
import { upsellClientData } from '@/lib/upsell-serialization';

const asBool = (v: unknown) => {
  if (v === true || v === false) return v;
  if (v == null) return undefined;
  const s = String(v).toLowerCase().trim();
  return ['1', 'true', 'on', 'yes', 'checked'].includes(s);
};

const optionalNonNegativePrice = z.preprocess(
  value => value === '' || value == null ? undefined : value,
  z.coerce.number().min(0, 'Delivery price must be a non-negative number.').optional(),
);

const baseFields = {
  id: z.string().optional().nullable(),
  creationKey: z.string().uuid().optional(),
  brandId: z.string().min(1, 'A brand must be selected.'),
  locationIds: z.array(z.string()).optional().default([]),
  categoryId: z.string().min(1, 'A category must be selected.'),
  productName: z.string().min(2, 'Product name must be at least 2 characters.'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'Price must be a non-negative number.'),
  priceDelivery: optionalNonNegativePrice,
  allergenIds: z.array(z.string()).optional().default([]),
  toppingGroupIds: z.array(z.string()).optional().default([]),
  isTestData: z.preprocess(asBool,z.boolean()).optional(),
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

async function fingerprintCreationRequest(
  productData: Record<string, unknown>,
  image: FormDataEntryValue | null,
): Promise<string> {
  const normalized = {
    ...productData,
    locationIds: [...(productData.locationIds as string[])].sort(),
    toppingGroupIds: [...(productData.toppingGroupIds as string[])].sort(),
    allergenIds: [...(productData.allergenIds as string[])].sort(),
    image: image instanceof File && (image.size > 0 || image.name)
      ? {
          type: image.type,
          size: image.size,
          digest: createHash('sha256')
            .update(Buffer.from(await image.arrayBuffer()))
            .digest('hex'),
        }
      : null,
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}


export async function createOrUpdateProduct(prevState: FormState | null, formData: FormData): Promise<FormState> {
    const id = formData.get('id')?.toString();
    const schema = id ? updateSchema : createSchema;
    const rawData: Record<string, unknown> = Object.fromEntries(formData);
    // HTML forms use the same name for each checked box, including a single choice.
    for (const key of ['locationIds', 'toppingGroupIds', 'allergenIds']) {
      rawData[key] = [...new Set([...formData.getAll(key), ...formData.getAll(`${key}[]`)])];
    }

    const parsed = schema.safeParse(rawData);

    if (!parsed.success) {
      const flatErrors = parsed.error.flatten();
      const errorMessages = Object.entries(flatErrors.fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
      return {
        ok: false,
        error: { message: `Validation failed: ${errorMessages}` },
      };
    }
    
    const { id: validatedId, creationKey, imageUrl: _imageUrl, ...productData } = parsed.data;
    const clearPriceDelivery = Boolean(id) && formData.has('priceDelivery') && formData.get('priceDelivery') === '';
    
    // For updates, filter out undefined values to prevent overwriting existing data.
    const toWrite: Partial<Product> = Object.fromEntries(
      Object.entries(productData).filter(([, value]) => value !== undefined),
    );

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
      if (!hasPermission(id ? 'products:edit' : 'products:create')) {
        return { ok: false, error: { message: 'You do not have permission to save products.' } };
      }
      const db = getAdminDb();
      const brand = await db.collection('brands').doc(productData.brandId).get();
      if (!brand.exists) throw new Error('The selected brand no longer exists.');
      const ref = id || creationKey
        ? db.collection('products').doc(id || creationKey!)
        : db.collection('products').doc();
      const existing = await ref.get();
      const image = formData.get('imageUrl');
      const creationFingerprint = !id && creationKey
        ? await fingerprintCreationRequest(productData, image)
        : undefined;
      if (id && (!existing.exists || existing.data()?.brandId !== productData.brandId)) {
        throw new Error('The product does not exist or belongs to another brand.');
      }
      // The same form retries the same creation key after a lost response.
      if (!id && existing.exists) {
        if (existing.data()?.creationKey !== creationKey ||
            existing.data()?.brandId !== productData.brandId ||
            existing.data()?.creationFingerprint !== creationFingerprint) {
          throw new Error('Creation reference was already saved with different values. Open a new product form.');
        }
        return { ok: true, id: ref.id };
      }
      const brandLocations = await db.collection('locations').where('brandId', '==', productData.brandId).get();
      const brandLocationIds = new Set(brandLocations.docs.map(doc => doc.id));
      if (productData.locationIds.some(locationId => !brandLocationIds.has(locationId))) {
        throw new Error('Every selected location must belong to the selected brand.');
      }
      const category = await db.collection('categories').doc(productData.categoryId).get();
      const categoryLocations: string[] = category.data()?.locationIds || [];
      const requiredLocationIds = productData.locationIds.length > 0
        ? productData.locationIds
        : [...brandLocationIds];
      if (!category.exists || brandLocationIds.size === 0 ||
          requiredLocationIds.some(locationId => !categoryLocations.includes(locationId))) {
        throw new Error('The category must belong to the brand and be available at the selected locations.');
      }
      for (const groupId of productData.toppingGroupIds) {
        const group = await db.collection('topping_groups').doc(groupId).get();
        const groupLocations: string[] = group.data()?.locationIds || [];
        if (!group.exists || !groupLocations.some(locationId => brandLocationIds.has(locationId))) {
          throw new Error('Every topping group must belong to the selected brand.');
        }
      }
      for (const allergenId of productData.allergenIds) {
        if (!(await db.collection('allergens').doc(allergenId).get()).exists) {
          throw new Error('A selected allergen no longer exists.');
        }
      }

      if (image instanceof File && (image.size > 0 || image.name)) {
        toWrite.imageUrl = await uploadProductImage(image, productData.brandId, ref.id);
      } else if (typeof image === 'string' && image && image !== existing.data()?.imageUrl) {
        throw new Error('Upload an image file instead of supplying an external image URL.');
      }
      // With no replacement file, omit imageUrl entirely to preserve the stored image.
      const now = new Date();
      if (id) {
        await ref.update({
          ...toWrite,
          ...(clearPriceDelivery ? { priceDelivery: admin.firestore.FieldValue.delete() } : {}),
          updatedAt: now,
        });
      } else {
        const payload = {
          ...toWrite, id: ref.id,
          ...(creationKey ? { creationKey } : {}),
          ...(creationFingerprint ? { creationFingerprint } : {}),
          isActive: toWrite.isActive ?? false,
          createdAt: now, updatedAt: now,
        };
        try {
          await ref.create(payload);
        } catch (error: any) {
          // Concurrent retries may race, but must never create a second product.
          const saved = creationKey ? await ref.get() : null;
          if (saved?.data()?.creationKey !== creationKey ||
              saved?.data()?.brandId !== productData.brandId ||
              saved?.data()?.creationFingerprint !== creationFingerprint) throw error;
        }
      }
      // A cache failure must not turn a committed write into a misleading save error.
      try {
        revalidatePath('/superadmin/products');
        revalidateTag('storefront');
      } catch (error) {
        console.error('[products.createOrUpdate] Cache refresh failed', error);
      }
      return { ok: true, id: ref.id };
    } catch (e: any) {
      console.error('[products.createOrUpdate] Firestore write failed', {
        message: e?.message,
        code: e?.code,
        stack: e?.stack,
      });
      return {
        ok: false,
        error: {
          message: 'Product could not be saved',
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
    revalidateTag('storefront');
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
    revalidateTag('storefront');
        return { message: 'Product order updated.', error: false };
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to update product order: ${errorMessage}`, error: true };
    }
}

export async function getProducts(): Promise<Product[]> {
    const db = getAdminDb();
    // New/imported products may not have sortOrder yet; orderBy would omit them.
    const querySnapshot = await db.collection('products').get();
    const products = querySnapshot.docs.map(doc => upsellClientData({ ...doc.data(), id: doc.id })) as Product[];
    const order = (product: Product) => Number.isFinite(product.sortOrder) ? product.sortOrder! : Number.MAX_SAFE_INTEGER;
    return products.sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id));
}

export async function getProductById(productId: string): Promise<Product | null> {
    const db = getAdminDb();
    const docRef = db.collection('products').doc(productId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        return upsellClientData({ ...docSnap.data(), id: docSnap.id }) as Product;
    }
    return null;
}

export async function getProductsByIds(productIds: string[], brandId?: string, locationId?: string): Promise<ProductForMenu[]> {
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
    const allProducts = productArrays.flat().filter(product => !locationId || (
        product.isActive === true &&
        product.isTestData !== true &&
        (!(product.locationIds || []).length || product.locationIds.includes(locationId))
    ));

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
    revalidateTag('storefront');
    return { success: true, message: `${duplicatedCount} products duplicated successfully.` };
  } catch (e: any) {
    console.error('Failed to duplicate products:', e);
    return { success: false, message: `An error occurred: ${e.message}` };
  }
}
