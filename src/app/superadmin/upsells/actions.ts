
'use server';

import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { getScopedDocument, listScopedDocuments, mutateScopedDocument } from '@/lib/access/scoped-data';
import { listLocationCatalog } from '@/lib/access/location-catalog';
import { restaurantClock } from '@/lib/promotion-rules';
import { upsellClientData } from '@/lib/upsell-serialization';
import { revalidatePath } from 'next/cache';
import { getAdminDb, admin } from '@/lib/firebase-admin';
import type { Upsell, Product, Category, CartItem, ProductForMenu, Brand, Location } from '@/types';
import { z, type ZodIssue } from 'zod';
import { redirect } from 'next/navigation';
import { getProductsByIds } from '../products/actions';

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

const activeTimeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const triggerConditionSchema = z.object({
  id: z.string(),
  type: z.enum([
    'product_in_cart',
    'category_in_cart',
    'cart_value_over',
    'combo_in_cart',
    'product_tag_in_cart',
  ]),
  referenceId: z.string().min(1, 'A reference value is required.'),
});

const upsellSchema = z.object({
    id: z.string().optional(),
    brandId: z.string().min(1, 'A brand must be selected.'),
    locationIds: z.array(z.string()).min(1, 'At least one location must be selected.'),
    upsellName: z.string().min(2, 'Upsell name must be at least 2 characters.'),
    description: z.string().optional().nullable(),
    imageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')).nullable(),

    offerType: z.enum(['product', 'category']),
    offerProductIds: z.array(z.string()).optional().default([]),
    offerCategoryIds: z.array(z.string()).optional().default([]),

    discountType: z.enum(['none', 'percentage', 'fixed_amount']),
    discountValue: z.coerce.number().positive('Discount value must be positive.').optional(),

    triggerConditions: z.array(triggerConditionSchema).min(1, 'At least one trigger condition is required.'),

    orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type must be selected.'),
    activeDays: z.array(z.string()).optional().default([]),
    activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    isActive: z.boolean().default(true),
    tags: z.array(z.enum(['Popular', 'Recommended', 'Campaign'])).optional().default([]),
  }).refine(data => {
      return !(data.offerType === 'product' && (!data.offerProductIds || data.offerProductIds.length === 0));
  }, {
      message: "At least one product must be selected for a product-based offer.",
      path: ["offerProductIds"],
  }).refine(data => {
      return !(data.offerType === 'category' && (!data.offerCategoryIds || data.offerCategoryIds.length === 0));
  }, {
      message: "At least one category must be selected for a category-based offer.",
      path: ["offerCategoryIds"],
  }).refine(data => {
      return !((data.discountType === 'percentage' || data.discountType === 'fixed_amount') && (data.discountValue === undefined || data.discountValue <= 0));
  }, {
      message: "A positive discount value is required for this discount type.",
      path: ["discountValue"],
  });


export type FormState = {
  message: string;
  error: boolean;
  errors?: z.ZodIssue[];
};

export async function createOrUpdateUpsell(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  try {
    await verifiedOrderflyIdentity();
    const id = formData.get('id') as string | null;

    const safeParseFloat = (value: FormDataEntryValue | null): number | undefined => {
        if (value === null || typeof value !== 'string' || value.trim() === '') {
            return undefined;
        }
        const num = parseFloat(value.replace(',', '.'));
        return isNaN(num) ? undefined : num;
    };

    const rawData: Record<string, any> = {
      brandId: formData.get('brandId'),
      locationIds: formData.getAll('locationIds'),
      upsellName: formData.get('upsellName'),
      description: formData.get('description'),
      imageUrl: formData.get('imageUrl'),
      offerType: formData.get('offerType'),
      offerProductIds: formData.getAll('offerProductIds'),
      offerCategoryIds: formData.getAll('offerCategoryIds'),
      discountType: formData.get('discountType'),
      discountValue: safeParseFloat(formData.get('discountValue')),
      isActive: formData.has('isActive'),
      orderTypes: formData.getAll('orderTypes'),
      activeDays: formData.getAll('activeDays'),
      tags: formData.getAll('tags'),
    };
    
    if (id) rawData.id = id;

    const startDateString = formData.get('startDate') as string | null;
    if (startDateString) rawData.startDate = new Date(startDateString);
    
    const endDateString = formData.get('endDate') as string | null;
    if (endDateString) rawData.endDate = new Date(endDateString);
    
    const activeTimeSlotsJSON = formData.get('activeTimeSlots');
    if (typeof activeTimeSlotsJSON === 'string' && activeTimeSlotsJSON.trim() !== '') {
        rawData.activeTimeSlots = JSON.parse(activeTimeSlotsJSON);
    } else {
        rawData.activeTimeSlots = [];
    }

    const triggerConditionsJSON = formData.get('triggerConditions');
    if (typeof triggerConditionsJSON === 'string' && triggerConditionsJSON.trim() !== '') {
        rawData.triggerConditions = JSON.parse(triggerConditionsJSON);
    } else {
        rawData.triggerConditions = [];
    }

    const validatedFields = upsellSchema.safeParse(rawData);
    
    if (!validatedFields.success) {
      console.error('Validation errors:', validatedFields.error.flatten());
      return {
        message: 'Validation failed. Check your inputs.',
        error: true,
        errors: validatedFields.error.issues,
      };
    }
    
    const { id: _ignoredId, startDate, endDate, description, imageUrl, ...rest } = validatedFields.data;
    
    const normalised = {
        ...rest,
        description: description ?? null,
        imageUrl: imageUrl ?? null,
    };

    const db = getAdminDb();

    
    const dataToSave: Omit<
      Upsell,
      'id' | 'createdAt' | 'updatedAt' | 'startDate' | 'endDate' | 'views' | 'conversions'
    > & {
      createdAt?: admin.firestore.Timestamp;
      updatedAt: admin.firestore.Timestamp;
      startDate?: admin.firestore.Timestamp;
      endDate?: admin.firestore.Timestamp;
      views: number;
      conversions: number;
    } = {
      ...normalised,
      updatedAt: admin.firestore.Timestamp.now(),
      views: 0,
      conversions: 0,
    };
    
    if (startDate) dataToSave.startDate = admin.firestore.Timestamp.fromDate(startDate);
    if (endDate) dataToSave.endDate = admin.firestore.Timestamp.fromDate(endDate);
    if (!id) dataToSave.createdAt = admin.firestore.Timestamp.now();

    const upsellRef = id ? db.collection('upsells').doc(id) : db.collection('upsells').doc();
    
    const writeData = Object.fromEntries(Object.entries({ ...dataToSave, id: upsellRef.id }).filter(([, value]) => value !== undefined));
    await mutateScopedDocument('upsells',upsellRef.id,id?'orderfly.catalog:edit':'orderfly.catalog:create','locations',before=>({...before,...writeData,views:before?.views??0,conversions:before?.conversions??0}));
    
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    console.error('Error in createOrUpdateUpsell:', e);
    return { message: `Failed to save upsell: ${errorMessage}`, error: true };
  }

  revalidatePath('/superadmin/upsells');
  redirect('/superadmin/upsells');
}

export async function deleteUpsell(upsellId: string) {
    try {
        const db = getAdminDb();
        await mutateScopedDocument('upsells',upsellId,'orderfly.catalog:delete','locations',()=>null);
        revalidatePath("/superadmin/upsells");
        return { message: "Upsell deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete upsell: ${errorMessage}`, error: true };
    }
}

export async function getUpsells(): Promise<Upsell[]> {
  const documents=await listScopedDocuments('upsells','orderfly.catalog:view','locations');
  return documents.sort((a,b)=>String(a.data().upsellName||'').localeCompare(String(b.data().upsellName||''))).map(doc => {
    const data = doc.data() as Omit<Upsell, 'id'>;
    return upsellClientData({
      ...data,
      id: doc.id,
    } as Upsell);
  });
}

export async function getUpsellById(upsellId: string): Promise<Upsell | null> {
    const docSnap=await getScopedDocument('upsells',upsellId,'orderfly.catalog:view','locations');
    if (docSnap) {
        const data = docSnap.data() as Omit<Upsell, 'id'>;
        return upsellClientData({
            ...data,
            id: docSnap.id,
        } as Upsell);
    }
    return null;
}

// Logic to find a matching upsell for the current cart state
type GetActiveUpsellParams = {
  brandId: string;
  locationId: string;
  deliveryType: 'pickup' | 'delivery';
  cartItems: { id: string; categoryId?: string; itemType?: 'product' | 'combo'; tags?: string[]; includedProductIds?: string[] }[];
  cartTotal: number;
  excludedUpsellIds?: string[];
};
export async function getActiveUpsellForCart({
  brandId,
  locationId,
  deliveryType,
  cartItems,
  cartTotal,
  excludedUpsellIds = [],
}: GetActiveUpsellParams): Promise<{
  upsell: Upsell;
  products: ProductForMenu[];
} | null> {
  const now = new Date();
  const currentDay = restaurantClock(now).day;
  const db = getAdminDb();

  // 1. Fetch all potentially active upsells for the brand and location
  const q = db.collection('upsells')
    .where('brandId', '==', brandId)
    .where('locationIds', 'array-contains', locationId)
    .where('isActive', '==', true);
  
  const snapshot = await q.get();
  
  const allUpsells = snapshot.docs.map(doc => {
    const data = doc.data() as Omit<Upsell, 'id'>;
    return {
      ...data,
      id: doc.id,
    } as Upsell;
  });
  
  // 2. Filter by date, day, and time in code
  const activeNowUpsells = allUpsells.filter(upsell => {
      if (excludedUpsellIds.includes(upsell.id)) return false;
      if (!(upsell.orderTypes || []).includes(deliveryType)) return false;
      const startDate = toDate(upsell.startDate) ?? null;
      const endDate = toDate(upsell.endDate) ?? null;
      if (startDate && now < startDate) return false;
      if (endDate && now > endDate) return false;

      if ((upsell.activeDays || []).length > 0 && !upsell.activeDays.includes(currentDay)) return false;

      if ((upsell.activeTimeSlots || []).length > 0) {
          const currentTime = restaurantClock(now).time;
          const inActiveTime = upsell.activeTimeSlots.some(slot => currentTime >= slot.start && currentTime <= slot.end);
          if(!inActiveTime) return false;
      }
      return true;
  });
  
  if (activeNowUpsells.length === 0) return null;

  const cartProductIds = cartItems.map(item => item.id);
  const cartCategoryIds = new Set(cartItems.map(item => item.categoryId).filter(Boolean));
  
  // 3. Check trigger conditions for each active upsell
  for (const upsell of activeNowUpsells) {
      let isTriggered = false;
      for (const condition of upsell.triggerConditions) {
          if (condition.type === 'cart_value_over') {
              if (cartTotal > parseFloat(condition.referenceId)) isTriggered = true;
          } else if (condition.type === 'product_in_cart') {
              if (cartProductIds.includes(condition.referenceId)) isTriggered = true;
          } else if (condition.type === 'category_in_cart') {
               if (cartCategoryIds.has(condition.referenceId)) isTriggered = true;
          } else if (condition.type === 'combo_in_cart') {
              if (cartItems.some(item => item.itemType === 'combo' && item.id === condition.referenceId)) isTriggered = true;
          } else if (condition.type === 'product_tag_in_cart') {
              if (cartItems.some(item => (item.tags || []).includes(condition.referenceId))) isTriggered = true;
          }
          if (isTriggered) break; // If any condition is met, we don't need to check others for this upsell
      }

      if (isTriggered) {
           // 4. If triggered, fetch the offered products
          let offeredProductIds: string[] = [];
          if (upsell.offerType !== 'product' && !upsell.offerCategoryIds?.length) continue;
          if (upsell.offerType === 'product') {
              offeredProductIds = upsell.offerProductIds;
          } else { // offerType is 'category'
              const catProductsQuery = db.collection('products').where('brandId', '==', brandId).where('categoryId', 'in', upsell.offerCategoryIds.slice(0,30));
              const catProductsSnapshot = await catProductsQuery.get();
              offeredProductIds = catProductsSnapshot.docs.map(doc => doc.id);
          }
          
          // 5. Suppression Logic: Filter out products already in the cart
          const currentCartProductIds = new Set(cartItems.flatMap(item => [item.id, ...(item.includedProductIds || [])]));
          const finalProductIds = offeredProductIds.filter(id => !currentCartProductIds.has(id));

          if (finalProductIds.length > 0) {
              // Fetch full product details
              // Only return products that are currently public at this restaurant.
              // If an old offer has no valid products, continue to the next offer.
              const products = await getProductsByIds(finalProductIds, brandId, locationId);
              
              if (products.length > 0) {
                  // Read only. UI telemetry records impressions when actually visible.
                  const serializableUpsell = {
                    ...upsell,
                    startDate: toDate(upsell.startDate)?.toISOString(),
                    endDate: toDate(upsell.endDate)?.toISOString(),
                    createdAt: toDate(upsell.createdAt)?.toISOString(),
                    updatedAt: toDate(upsell.updatedAt)?.toISOString(),
                  };
                  return { upsell: serializableUpsell as unknown as Upsell, products: products as ProductForMenu[] }; // Return the first valid upsell found
              }
          }
      }
  }

  return null; // No valid upsell found
}


// Retained for stale browser bundles. A browser click must never mutate paid counters.
export async function incrementUpsellConversion(_upsellId: string): Promise<{ success: boolean }> {
  return { success: false };
}

export async function getProductsForBrand(brandId: string): Promise<ProductForMenu[]> {
  const rows=await listScopedDocuments('products','orderfly.catalog:view','locations',[['brandId','==',brandId]]);
  return upsellClientData(rows.map(doc=>({...doc.data(),id:doc.id})).sort((a:any,b:any)=>(a.sortOrder||999)-(b.sortOrder||999))) as ProductForMenu[];
}
export async function getCategoriesForBrand(brandId: string): Promise<Category[]> {
  return (await listLocationCatalog('categories',brandId)).sort((a,b)=>String(a.categoryName).localeCompare(String(b.categoryName))) as Category[];
}
