
'use server';

import 'server-only';

import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { toppingConditionsSchema, validateToppingConditions } from '@/lib/topping-condition-validation';
import type { Topping, ToppingGroup } from '@/types';
import { createHash } from 'node:crypto';
import { requireOrderflyAccess, verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction, getScopedDocument, listScopedDocuments, mutateScopedDocument } from '@/lib/access/scoped-data';
import { uploadProductImage } from '@/lib/superadmin/product-image-storage';
import { getProductBrandReferences } from '@/lib/superadmin/product-brand-references';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Product, ProductForMenu } from '@/types';
import * as admin from 'firebase-admin';
import { menuProduct, publicMenuProducts } from '@/lib/server/menu-products';
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
  id: z.preprocess(value => value === '' ? undefined : value, z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional().nullable()),
  creationKey: z.string().uuid().optional(),
  originalBrandId: z.string().min(1).optional(),
  brandId: z.string().min(1, 'A brand must be selected.'),
  locationIds: z.array(z.string()).optional().default([]),
  categoryId: z.string().min(1, 'A category must be selected.'),
  productName: z.string().min(2, 'Product name must be at least 2 characters.'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'Price must be a non-negative number.'),
  priceDelivery: optionalNonNegativePrice,
  allergenIds: z.array(z.string()).optional().default([]),
  toppingGroupIds: z.array(z.string()).optional().default([]),
  toppingGroupConditions: z.preprocess(value => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
  }, toppingConditionsSchema.optional()),
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
    // Production Server Actions can represent an untouched file input as a
    // named, zero-byte File. Only bytes make this an actual upload.
    image: image instanceof File && image.size > 0
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
    
    const { id: validatedId, creationKey, originalBrandId, imageUrl: _imageUrl, ...productData } = parsed.data;
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
      const permission = `orderfly.catalog:${id ? 'edit' : 'create'}`;
      const identity = await verifiedOrderflyIdentity();
      await requireOrderflyAccess(productData.brandId, productData.locationIds.length ? productData.locationIds : null, permission);
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
      if (id && !existing.exists) throw new Error('The product no longer exists.');
      if (id) {
        const currentBrandId = existing.data()?.brandId;
        await requireOrderflyAccess(currentBrandId, existing.data()?.locationIds?.length ? existing.data()!.locationIds : null, 'orderfly.catalog:edit');
        // Compare the submitted source with the stored brand, separately from permission checks.
        if ((originalBrandId !== undefined && originalBrandId !== currentBrandId) ||
            (currentBrandId !== productData.brandId && originalBrandId !== currentBrandId)) {
          throw new Error('The product brand has changed. Reload the product before saving.');
        }
        if (currentBrandId !== productData.brandId) {
          const references = await getProductBrandReferences(db, currentBrandId, ref.id);
          if (references.length > 0) {
            return { ok: false, error: {
              code: 'product/brand-in-use',
              message: `Cannot change brand while this product is used by: ${references.join('; ')}. Remove or replace its references in the original brand first, then retry. Inactive records are included. Your entries are preserved.`,
            } };
          }
        }
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
      const conditionGroups: ToppingGroup[] = [];
      for (const groupId of productData.toppingGroupIds) {
        const group = await db.collection('topping_groups').doc(groupId).get();
        const groupLocations: string[] = group.data()?.locationIds || [];
        if (group.exists) conditionGroups.push({ ...group.data(), id: group.id } as ToppingGroup);
        if (!group.exists || !groupLocations.some(locationId => brandLocationIds.has(locationId))) {
          throw new Error('Every topping group must belong to the selected brand.');
        }
      }
      const conditions = toppingConditionsSchema.parse(productData.toppingGroupConditions ?? existing.data()?.toppingGroupConditions ?? {});
      const triggerIds = [...new Set(Object.values(conditions).flat())];
      const triggerDocs = triggerIds.length ? await db.getAll(...triggerIds.map(trigger => db.collection('toppings').doc(trigger))) : [];
      const conditionToppings = triggerDocs.filter(doc => doc.exists && (!doc.data()?.brandId || doc.data()?.brandId === productData.brandId))
        .map(doc => ({ ...doc.data(), id: doc.id } as Topping));
      const conditionError = validateToppingConditions(conditions, productData.toppingGroupIds, conditionGroups, conditionToppings, requiredLocationIds);
      if (conditionError) throw new Error(conditionError);
      for (const allergenId of productData.allergenIds) {
        if (!(await db.collection('allergens').doc(allergenId).get()).exists) {
          throw new Error('A selected allergen no longer exists.');
        }
      }

      if (image instanceof File && image.size > 0) {
        toWrite.imageUrl = await uploadProductImage(image, productData.brandId, ref.id);
      } else if (typeof image === 'string' && image && image !== existing.data()?.imageUrl) {
        throw new Error('Upload an image file instead of supplying an external image URL.');
      }
      // With no replacement file, omit imageUrl entirely to preserve the stored image.
      const now = new Date();
      try {
      await db.runTransaction(async tx => {
        const current = await tx.get(ref);
        if (id) {
          if (!current.exists || !current.updateTime?.isEqual(existing.updateTime!)) throw Object.assign(new Error('The product changed while saving.'), { code: 'failed-precondition' });
          await authorizeTransaction(tx, identity, current.data()!, 'orderfly.catalog:edit', 'locations');
          await authorizeTransaction(tx, identity, { ...current.data(), ...toWrite }, 'orderfly.catalog:edit', 'locations');
          tx.update(ref, { ...toWrite, ...(clearPriceDelivery ? { priceDelivery: admin.firestore.FieldValue.delete() } : {}), updatedAt: now });
        } else {
          await authorizeTransaction(tx, identity, productData, 'orderfly.catalog:create', 'locations');
          if (current.exists) {
            if (!creationKey || current.data()?.creationKey !== creationKey || current.data()?.brandId !== productData.brandId || current.data()?.creationFingerprint !== creationFingerprint) throw new Error('Creation reference was already saved with different values.');
            return;
          }
          tx.create(ref, { ...toWrite, id: ref.id, ...(creationKey ? { creationKey } : {}), ...(creationFingerprint ? { creationFingerprint } : {}), isActive: toWrite.isActive ?? false, createdAt: now, updatedAt: now });
        }
      });
      } catch (error) {
        // A committed creation may lose its acknowledgement. Recheck current
        // authority and the exact saved payload before acknowledging that retry.
        if (id || !creationKey) throw error;
        await requireOrderflyAccess(productData.brandId, productData.locationIds.length ? productData.locationIds : null, permission);
        const saved = await ref.get();
        if (saved.data()?.creationKey !== creationKey || saved.data()?.brandId !== productData.brandId ||
            saved.data()?.creationFingerprint !== creationFingerprint) throw error;
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
      if (id && (e?.code === 9 || e?.code === 'failed-precondition')) {
        return { ok: false, error: { code: 'product/stale-edit', message: 'The product changed while saving. Reload it before trying again. Your entries are preserved.' } };
      }
      console.error('[products.createOrUpdate] Save failed', {
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
        await mutateScopedDocument('products', productId, 'orderfly.catalog:delete', 'locations', () => null);
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
        const rows = z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), sortOrder: z.number().int().min(0) }).strict()).max(400).parse(orderedProducts);
        if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate product.');
        const identity = await verifiedOrderflyIdentity();
        await db.runTransaction(async tx => {
          const updates = [];
          for (const row of rows) {
            const ref = db.collection('products').doc(row.id), saved = await tx.get(ref);
            if (!saved.exists) throw new Error('Product not found.');
            await authorizeTransaction(tx, identity, saved.data()!, 'orderfly.catalog:edit', 'locations');
            updates.push({ ref, sortOrder: row.sortOrder });
          }
          for (const row of updates) tx.update(row.ref, { sortOrder: row.sortOrder });
        });
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
    const querySnapshot = { docs: await listScopedDocuments('products', 'orderfly.catalog:view', 'locations') };
    const products = querySnapshot.docs.map(doc => upsellClientData({ ...doc.data(), id: doc.id })) as Product[];
    const order = (product: Product) => Number.isFinite(product.sortOrder) ? product.sortOrder! : Number.MAX_SAFE_INTEGER;
    return products.sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id));
}

export async function getProductById(productId: string): Promise<Product | null> {
    const db = getAdminDb();
    const docSnap = await getScopedDocument('products', productId, 'orderfly.catalog:view', 'locations');
    if (docSnap) {
        return upsellClientData({ ...docSnap.data(), id: docSnap.id }) as Product;
    }
    return null;
}

export async function getProductsByIds(productIds: string[], brandId?: string, locationId?: string): Promise<ProductForMenu[]> {
    const ids = [...new Set(z.array(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)).max(500).parse(productIds))];
    if (locationId) {
      if (!brandId) throw new Error('A brand is required for a public menu.');
      return publicMenuProducts(locationId, ids, brandId);
    }
    // Admin selectors may include inactive products, with per-record scope checks.
    await verifiedOrderflyIdentity();
    const products: ProductForMenu[] = [];
    for (const id of ids) {
      const doc = await getScopedDocument('products', id, 'orderfly.catalog:view', 'locations');
      if (doc && (!brandId || doc.data()?.brandId === brandId)) products.push(menuProduct({...doc.data(),id:doc.id} as Product));
    }
    return products;
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
  try {
    const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
    const input = z.object({ productIds:z.array(identifier).min(1).max(100),targetBrandId:identifier,targetLocationIds:z.array(identifier).max(100) }).parse({productIds,targetBrandId,targetLocationIds});
    const ids = [...new Set(input.productIds)];
    const identity = await verifiedOrderflyIdentity(), db = getAdminDb();
    const locations = [...new Set(input.targetLocationIds)];
    await requireOrderflyAccess(input.targetBrandId, locations.length ? locations : null, 'orderfly.catalog:create');
    await db.runTransaction(async tx => {
      const targetLocations = await tx.get(db.collection('locations').where('brandId','==',input.targetBrandId));
      const requiredLocations = locations.length ? locations : targetLocations.docs.map(doc=>doc.id);
      if (!requiredLocations.length) throw new Error('The target brand needs a location before products can be copied.');
      const copies = [];
      for (const id of ids) {
        const source = await tx.get(db.collection('products').doc(id));
        if (!source.exists) throw new Error('A selected product no longer exists.');
        const original = source.data()!;
        await authorizeTransaction(tx, identity, original, 'orderfly.catalog:view', 'locations');
        const target: Record<string,any> = {...original,brandId:input.targetBrandId,locationIds:locations};
        await authorizeTransaction(tx, identity, target, 'orderfly.catalog:create', 'locations');
        const category = await tx.get(db.collection('categories').doc(identifier.parse(original.categoryId)));
        if (!category.exists || requiredLocations.some(location=>!category.data()?.locationIds?.includes(location))) throw new Error('The product category must be available at every target location.');
        for (const groupId of original.toppingGroupIds || []) {
          const group = await tx.get(db.collection('topping_groups').doc(identifier.parse(groupId)));
          if (!group.exists || requiredLocations.some(location=>!group.data()?.locationIds?.includes(location))) throw new Error('The topping groups must be available at every target location.');
        }
        // A copy is a new creation. It must not inherit a previous form's
        // idempotency key, which could acknowledge an unrelated retry.
        const {id:_id,creationKey:_key,creationFingerprint:_fingerprint,...data} = target;
        const ref = db.collection('products').doc(), now = new Date();
        copies.push({ref,data:{...data,id:ref.id,sortOrder:9999,createdAt:now,updatedAt:now}});
      }
      for (const copy of copies) tx.create(copy.ref,copy.data);
    });
    revalidatePath('/superadmin/products');
    revalidateTag('storefront');
    return {success:true,message:`${ids.length} products duplicated successfully.`};
  } catch (error) {
    return {success:false,message:error instanceof Error ? error.message : 'Products could not be copied.'};
  }
}
