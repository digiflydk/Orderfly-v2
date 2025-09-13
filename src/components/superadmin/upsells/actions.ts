

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, Timestamp, getDoc, where, documentId, runTransaction } from 'firebase/firestore';
import type { Upsell, Product, Category, CartItem, ProductForMenu } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';

const activeTimeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const triggerConditionSchema = z.object({
    id: z.string(),
    type: z.enum(['product_in_cart', 'category_in_cart', 'cart_value_over', 'combo_in_cart', 'product_tag_in_cart']),
    referenceId: z.string().min(1, 'A reference value is required.'),
});

const upsellSchema = z.object({
    id: z.string().optional(),
    brandId: z.string().min(1, 'A brand must be selected.'),
    locationIds: z.array(z.string()).min(1, 'At least one location must be selected.'),
    upsellName: z.string().min(2, 'Upsell name must be at least 2 characters.'),
    description: z.string().optional(),
    imageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().nullable(),
    
    offerType: z.enum(['product', 'category']),
    offerProductIds: z.array(z.string()).optional().default([]),
    offerCategoryIds: z.array(z.string()).optional().default([]),

    discountType: z.enum(['none', 'percentage', 'fixed_amount']),
    discountValue: z.coerce.number().optional(),

    triggerConditions: z.array(triggerConditionSchema).min(1, 'At least one trigger condition is required.'),

    orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type must be selected.'),
    activeDays: z.array(z.string()).optional().default([]),
    activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    isActive: z.boolean().default(true),
    tags: z.array(z.enum(['Popular', 'Recommended', 'Campaign'])).optional().default([]),
}).refine(data => {
    return !(data.offerType === 'product' && data.offerProductIds.length === 0);
}, {
    message: "At least one product must be selected for a product-based offer.",
    path: ["offerProductIds"],
}).refine(data => {
    return !(data.offerType === 'category' && data.offerCategoryIds.length === 0);
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
    
    const activeTimeSlotsJSON = formData.get('activeTimeSlots') as string;
    rawData.activeTimeSlots = activeTimeSlotsJSON ? JSON.parse(activeTimeSlotsJSON) : [];
    
    const triggerConditionsJSON = formData.get('triggerConditions') as string;
    rawData.triggerConditions = triggerConditionsJSON ? JSON.parse(triggerConditionsJSON) : [];

    const validatedFields = upsellSchema.safeParse(rawData);
    
    if (!validatedFields.success) {
      console.error('Validation errors:', validatedFields.error.flatten());
      return {
        message: 'Validation failed. Check your inputs.',
        error: true,
        errors: validatedFields.error.issues,
      };
    }
    
    const upsellData = validatedFields.data;

    const dataToSave: Omit<Upsell, 'createdAt' | 'updatedAt' | 'views' | 'conversions'> & { createdAt?: Timestamp, updatedAt: Timestamp, startDate?: Timestamp, endDate?: Timestamp, views: number, conversions: number } = {
      ...upsellData,
      updatedAt: Timestamp.now(),
      views: id ? (await getUpsellById(id))?.views ?? 0 : 0,
      conversions: id ? (await getUpsellById(id))?.conversions ?? 0 : 0,
    };
    
    if (upsellData.startDate) dataToSave.startDate = Timestamp.fromDate(upsellData.startDate);
    if (upsellData.endDate) dataToSave.endDate = Timestamp.fromDate(upsellData.endDate);

    const upsellIdToSave = id || doc(collection(db, 'upsells')).id;
    dataToSave.id = upsellIdToSave;

    if (!id) {
      dataToSave.createdAt = Timestamp.now();
    }
    
    const upsellRef = doc(db, 'upsells', upsellIdToSave);
    await setDoc(upsellRef, dataToSave, { merge: true });
    
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
        await deleteDoc(doc(db, "upsells", upsellId));
        revalidatePath("/superadmin/upsells");
        return { message: "Upsell deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete upsell: ${errorMessage}`, error: true };
    }
}

export async function getUpsells(): Promise<Upsell[]> {
  const q = query(collection(db, 'upsells'), orderBy('upsellName'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    return { 
      ...data,
      id: doc.id,
      startDate: data.startDate ? (data.startDate as Timestamp).toDate() : undefined,
      endDate: data.endDate ? (data.endDate as Timestamp).toDate() : undefined,
      createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date(),
      updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : new Date(),
    }
  }) as Upsell[];
}

export async function getUpsellById(upsellId: string): Promise<Upsell | null> {
    const docRef = doc(db, 'upsells', upsellId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return { 
            ...data,
            id: docSnap.id,
            startDate: data.startDate ? (data.startDate as Timestamp).toDate() : undefined,
            endDate: data.endDate ? (data.endDate as Timestamp).toDate() : undefined,
            createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date(),
            updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : new Date(),
        } as Upsell;
    }
    return null;
}

// Logic to find a matching upsell for the current cart state
type GetActiveUpsellParams = {
  brandId: string;
  locationId: string;
  cartItems: { id: string; categoryId?: string }[];
  cartTotal: number;
};
export async function getActiveUpsellForCart({ brandId, locationId, cartItems, cartTotal }: GetActiveUpsellParams): Promise<{upsell: Upsell, products: ProductForMenu[]} | null> {
    const now = new Date();
    const currentDay = now.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();

    // 1. Fetch all potentially active upsells for the brand and location
    const q = query(collection(db, 'upsells'), 
        where('brandId', '==', brandId),
        where('locationIds', 'array-contains', locationId),
        where('isActive', '==', true),
    );
    const snapshot = await getDocs(q);
    
    const allUpsells = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        startDate: data.startDate ? (data.startDate as Timestamp).toDate() : undefined,
        endDate: data.endDate ? (data.endDate as Timestamp).toDate() : undefined,
        createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : undefined,
        updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : undefined,
      } as Upsell
    });
    
    // 2. Filter by date, day, and time
    const activeNowUpsells = allUpsells.filter(upsell => {
        const startDate = upsell.startDate;
        const endDate = upsell.endDate;
        if (startDate && now < startDate) return false;
        if (endDate && now > endDate) return false;

        if (upsell.activeDays.length > 0 && !upsell.activeDays.includes(currentDay)) return false;

        if (upsell.activeTimeSlots.length > 0) {
            const currentTime = now.toTimeString().slice(0,5);
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
            }
            if (isTriggered) break; // If any condition is met, we don't need to check others for this upsell
        }

        if (isTriggered) {
             // 4. If triggered, fetch the offered products
            let offeredProductIds: string[] = [];
            if (upsell.offerType === 'product') {
                offeredProductIds = upsell.offerProductIds;
            } else { // offerType is 'category'
                const catProductsQuery = query(collection(db, 'products'), where('categoryId', 'in', upsell.offerCategoryIds));
                const catProductsSnapshot = await getDocs(catProductsQuery);
                offeredProductIds = catProductsSnapshot.docs.map(doc => doc.id);
            }
            
            // 5. Suppression Logic: Filter out products already in the cart
            const currentCartProductIds = new Set(cartItems.map(item => item.id));
            const finalProductIds = offeredProductIds.filter(id => !currentCartProductIds.has(id));

            if (finalProductIds.length > 0) {
                // Fetch full product details
                const productsQuery = query(collection(db, 'products'), where(documentId(), 'in', finalProductIds.slice(0, 30)));
                const productsSnapshot = await getDocs(productsQuery);
                const products = productsSnapshot.docs.map(doc => doc.data() as Product);
                
                if (products.length > 0) {
                    // Increment the views count
                    try {
                        const upsellRef = doc(db, 'upsells', upsell.id);
                        await runTransaction(db, async (transaction) => {
                            const sfDoc = await transaction.get(upsellRef);
                            if (!sfDoc.exists()) { throw "Document does not exist!"; }
                            const newViews = (sfDoc.data().views || 0) + 1;
                            transaction.update(upsellRef, { views: newViews });
                        });
                    } catch(e) {
                        console.error("Failed to increment upsell views:", e);
                    }
                    
                    // Convert Date objects to ISO strings before returning
                    const serializableUpsell = {
                        ...upsell,
                        startDate: upsell.startDate?.toISOString(),
                        endDate: upsell.endDate?.toISOString(),
                        createdAt: upsell.createdAt?.toISOString(),
                        updatedAt: upsell.updatedAt?.toISOString(),
                    };

                    return { upsell: serializableUpsell as unknown as Upsell, products: products as ProductForMenu[] }; // Return the first valid upsell found
                }
            }
        }
    }

    return null; // No valid upsell found
}


export async function incrementUpsellConversion(upsellId: string): Promise<{ success: boolean }> {
    try {
        const upsellRef = doc(db, 'upsells', upsellId);
        await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(upsellRef);
            if (!sfDoc.exists()) { throw "Document does not exist!"; }
            const newConversions = (sfDoc.data().conversions || 0) + 1;
            transaction.update(upsellRef, { conversions: newConversions });
        });
        return { success: true };
    } catch(e) {
        console.error("Failed to increment upsell conversions:", e);
        return { success: false };
    }
}
