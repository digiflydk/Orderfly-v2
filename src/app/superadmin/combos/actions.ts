

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, where, Timestamp, getDoc, documentId } from 'firebase/firestore';
import type { ComboMenu, Product, Category, ProductForMenu } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { getProductsByIds } from '../products/actions';

const productGroupSchema = z.object({
  id: z.string(),
  groupName: z.string().min(1, "Group name is required."),
  productIds: z.array(z.string()).min(1, "Each group must have at least one product."),
  minSelection: z.coerce.number().min(0, "Min selection must be 0 or more."),
  maxSelection: z.coerce.number().min(0, "Max selection must be 0 or more."),
}).refine(data => data.maxSelection === 0 || data.maxSelection >= data.minSelection, {
    message: "Max selection must be 0 (for unlimited) or greater than or equal to min selection.",
    path: ["maxSelection"],
});

const activeTimeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const comboMenuSchema = z.object({
    id: z.string().optional(),
    brandId: z.string().min(1, 'A brand must be selected.'),
    locationIds: z.array(z.string()).min(1, 'At least one location must be selected.'),
    comboName: z.string().min(2, 'Combo name must be at least 2 characters.'),
    description: z.string().optional(),
    imageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().nullable(),
    pickupPrice: z.coerce.number().min(0, "Price must be a non-negative number.").optional(),
    deliveryPrice: z.coerce.number().min(0, "Price must be a non-negative number.").optional(),
    isActive: z.boolean().default(true),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    activeDays: z.array(z.string()).optional().default([]),
    activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
    orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type must be selected.'),
    tags: z.array(z.enum(['Popular', 'Recommended', 'Campaign'])).optional().default([]),
    productGroups: z.array(productGroupSchema).min(1, 'At least one product group must be configured.'),
}).refine(data => data.pickupPrice !== undefined || data.deliveryPrice !== undefined, {
    message: "At least one price (Pickup or Delivery) must be provided.",
    path: ["pickupPrice"],
}).refine(data => {
    return !(data.orderTypes.includes('pickup') && (data.pickupPrice === undefined || data.pickupPrice === null));
}, {
    message: "Pickup price must be set if pickup is an available order type.",
    path: ["pickupPrice"],
}).refine(data => {
    return !(data.orderTypes.includes('delivery') && (data.deliveryPrice === undefined || data.deliveryPrice === null));
}, {
    message: "Delivery price must be set if delivery is an available order type.",
    path: ["deliveryPrice"],
});


export type FormState = {
  message: string;
  error: boolean;
  errors?: z.ZodIssue[];
};

export async function createOrUpdateCombo(
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
      comboName: formData.get('comboName'),
      description: formData.get('description'),
      imageUrl: formData.get('imageUrl'),
      pickupPrice: safeParseFloat(formData.get('pickupPrice')),
      deliveryPrice: safeParseFloat(formData.get('deliveryPrice')),
      isActive: formData.has('isActive'),
      orderTypes: formData.getAll('orderTypes'),
      activeDays: formData.getAll('activeDays'),
      tags: formData.getAll('tags'),
    };
    
    if (id) rawData.id = id;

    const startDate = formData.get('startDate');
    if (startDate) rawData.startDate = startDate as string;
    const endDate = formData.get('endDate');
    if (endDate) rawData.endDate = endDate as string;
    
    const productGroupsJSON = formData.get('productGroups');
    if (typeof productGroupsJSON === 'string' && productGroupsJSON.trim() !== '') {
        let parsedGroups = JSON.parse(productGroupsJSON);
        rawData.productGroups = parsedGroups.map((group: any) => ({
            ...group,
            minSelection: Number(group.minSelection || 0),
            maxSelection: Number(group.maxSelection || 0)
        }));
    } else {
        rawData.productGroups = [];
    }

    const activeTimeSlotsJSON = formData.get('activeTimeSlots');
    if (typeof activeTimeSlotsJSON === 'string' && activeTimeSlotsJSON.trim() !== '') {
        rawData.activeTimeSlots = JSON.parse(activeTimeSlotsJSON);
    } else {
        rawData.activeTimeSlots = [];
    }
    
    const validatedFields = comboMenuSchema.safeParse(rawData);
    
    if (!validatedFields.success) {
      console.error('Validation errors:', validatedFields.error.flatten());
      return {
        message: 'Validation failed. Check your inputs.',
        error: true,
        errors: validatedFields.error.issues,
      };
    }
    
    const comboData = validatedFields.data;

    const allProductIds = comboData.productGroups.flatMap(g => g.productIds);
    if (allProductIds.length === 0) {
      return { message: "Combo must contain at least one product.", error: true };
    }
    
    if (allProductIds.length > 30) {
        return { message: "Cannot fetch more than 30 products for a combo.", error: true };
    }
    
    const products = await getProductsByIds(allProductIds, comboData.brandId);

    if(products.some(p => p.brandId !== comboData.brandId)) {
      return { message: "Error: All selected products must belong to the selected brand.", error: true };
    }

    const calculateNormalPriceForType = (priceType: 'pickup' | 'delivery'): number => {
      return comboData.productGroups.reduce((total, group) => {
          const highestPricedProductInGroup = group.productIds.reduce((maxPrice, productId) => {
              const product = products.find(p => p.id === productId);
              if (!product) return maxPrice;
              const price = priceType === 'delivery' ? (product.priceDelivery ?? product.price) : product.price;
              return Math.max(maxPrice, price);
          }, 0);
          return total + (highestPricedProductInGroup * group.minSelection); // Using minSelection for this calculation
      }, 0);
    }

    const calculatedNormalPricePickup = calculateNormalPriceForType('pickup');
    const calculatedNormalPriceDelivery = calculateNormalPriceForType('delivery');

    const priceDifferencePickup = typeof comboData.pickupPrice === 'number' ? calculatedNormalPricePickup - comboData.pickupPrice : undefined;
    const priceDifferenceDelivery = typeof comboData.deliveryPrice === 'number' ? calculatedNormalPriceDelivery - comboData.deliveryPrice : undefined;

    const dataToSave: Omit<ComboMenu, 'createdAt' | 'updatedAt'> & { createdAt?: Timestamp, updatedAt: Timestamp, startDate?: Timestamp, endDate?: Timestamp } = {
      ...comboData,
      calculatedNormalPricePickup,
      calculatedNormalPriceDelivery,
      priceDifferencePickup,
      priceDifferenceDelivery,
      updatedAt: Timestamp.now(),
    };
    
    if (comboData.startDate) dataToSave.startDate = Timestamp.fromDate(new Date(comboData.startDate));
    if (comboData.endDate) dataToSave.endDate = Timestamp.fromDate(new Date(comboData.endDate));

    const comboIdToSave = id || doc(collection(db, 'comboMenus')).id;
    dataToSave.id = comboIdToSave;

    if (!id) {
      dataToSave.createdAt = Timestamp.now();
    }
    
    const comboRef = doc(db, 'comboMenus', comboIdToSave);
    await setDoc(comboRef, dataToSave, { merge: true });
    
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    console.error('Error in createOrUpdateCombo:', e);
    return { message: `Failed to save combo: ${errorMessage}`, error: true };
  }

  revalidatePath('/superadmin/combos');
  redirect('/superadmin/combos');
}

export async function deleteCombo(comboId: string) {
    try {
        await deleteDoc(doc(db, "comboMenus", comboId));
        revalidatePath("/superadmin/combos");
        return { message: "Combo deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete combo: ${errorMessage}`, error: true };
    }
}

export async function getCombos(): Promise<ComboMenu[]> {
  const q = query(collection(db, 'comboMenus'), orderBy('comboName'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    return { 
      ...data,
      id: doc.id,
      startDate: data.startDate ? (data.startDate as Timestamp).toDate().toISOString() : undefined,
      endDate: data.endDate ? (data.endDate as Timestamp).toDate().toISOString() : undefined,
      createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date(),
      updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : new Date(),
    }
  }) as ComboMenu[];
}

export async function getComboById(comboId: string): Promise<ComboMenu | null> {
    const docRef = doc(db, 'comboMenus', comboId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return { 
            ...data,
            id: docSnap.id,
            startDate: data.startDate ? (data.startDate as Timestamp).toDate().toISOString() : undefined,
            endDate: data.endDate ? (data.endDate as Timestamp).toDate().toISOString() : undefined,
            createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date(),
            updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : new Date(),
        } as ComboMenu;
    }
    return null;
}

export async function getProductsForBrand(brandId: string): Promise<Product[]> {
  if (!brandId) return [];
  const q = query(collection(db, 'products'), where('brandId', '==', brandId), orderBy('sortOrder', 'asc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as Product);
}

export async function getCategoriesForBrand(brandId: string): Promise<Category[]> {
    if (!brandId) return [];
    
    const q = query(collection(db, 'categories'), where('brandId', '==', brandId));
    const categorySnapshots = await getDocs(q);

    const categories: Category[] = [];
    categorySnapshots.forEach(doc => {
        categories.push({ id: doc.id, ...doc.data() } as Category);
    });

    return categories.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
}

export async function getActiveCombosForLocation(locationId: string): Promise<ComboMenu[]> {
    const now = new Date();
    const currentDay = now.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();

    const q = query(collection(db, 'comboMenus'), 
        where('locationIds', 'array-contains', locationId),
        where('isActive', '==', true),
    );
    const snapshot = await getDocs(q);
    
    const allCombos = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        startDate: data.startDate ? (data.startDate as Timestamp).toDate().toISOString() : undefined,
        endDate: data.endDate ? (data.endDate as Timestamp).toDate().toISOString() : undefined,
        createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date(),
        updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : new Date(),
      } as ComboMenu
    });
    
    // Filter by date, day, and time in code
    const activeNowCombos = allCombos.filter(combo => {
        const startDate = combo.startDate ? new Date(combo.startDate) : null;
        const endDate = combo.endDate ? new Date(combo.endDate) : null;

        if (startDate && now < startDate) return false;
        if (endDate && now > endDate) return false;

        if (combo.activeDays.length > 0 && !combo.activeDays.includes(currentDay)) return false;

        if (combo.activeTimeSlots.length > 0) {
            const currentTime = now.toTimeString().slice(0,5);
            const inActiveTime = combo.activeTimeSlots.some(slot => currentTime >= slot.start && currentTime <= slot.end);
            if(!inActiveTime) return false;
        }
        return true;
    });

    return activeNowCombos;
}
