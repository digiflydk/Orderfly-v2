

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, Timestamp, getDoc, where, documentId, updateDoc } from 'firebase/firestore';
import type { StandardDiscount, CartItem, Product } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';

const activeTimeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const standardDiscountSchema = z.object({
  id: z.string().optional(),
  brandId: z.string().min(1, 'A brand must be selected.'),
  locationIds: z.array(z.string()).min(1, { message: 'At least one location must be selected.' }),
  discountName: z.string().min(2, 'Discount name is required.'),
  discountType: z.enum(['product', 'category', 'cart', 'free_delivery']),
  referenceIds: z.array(z.string()).optional().default([]),
  discountMethod: z.enum(['percentage', 'fixed_amount']),
  discountValue: z.coerce.number().positive('Discount value must be positive.').optional(),
  minOrderValue: z.coerce.number().min(0).optional(),
  isActive: z.boolean().default(true),
  orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type is required.'),
  activeDays: z.array(z.string()).optional().default([]),
  activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
  timeSlotValidationType: z.enum(['orderTime', 'pickupTime']),
  startDate: z.string().or(z.date()).optional(),
  endDate: z.string().or(z.date()).optional(),
  allowStacking: z.boolean().default(false),
  // New marketing fields
  discountHeading: z.string().optional(),
  discountDescription: z.string().optional(),
  discountImageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().nullable(),
  assignToOfferCategory: z.boolean().default(false),
}).superRefine((data, ctx) => {
    if (data.discountType === 'product' && (!data.referenceIds || data.referenceIds.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['referenceIds'],
            message: 'At least one Product must be selected for this discount type.',
        });
    }
    if (data.discountType === 'category' && (!data.referenceIds || data.referenceIds.length === 0)) {
       ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['referenceIds'],
            message: 'At least one Category must be selected for this discount type.',
        });
    }
    if ((data.discountType === 'cart' || data.discountType === 'free_delivery') && (!data.minOrderValue || data.minOrderValue <= 0)) {
       ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['minOrderValue'],
            message: 'A minimum order value is required for this discount type.',
        });
    }
    if ((data.discountMethod === 'percentage' || data.discountMethod === 'fixed_amount') && data.discountType !== 'free_delivery' && (!data.discountValue || data.discountValue <= 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['discountValue'],
            message: 'A positive discount value is required for this discount method.',
        });
    }
});


export type FormState = {
  message: string;
  error: boolean;
  errors?: z.ZodIssue[];
};

export async function createOrUpdateStandardDiscount(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  try {
    const rawData: Record<string, any> = Object.fromEntries(formData.entries());
    
    // Explicitly handle array fields from FormData
    rawData.locationIds = formData.getAll('locationIds');
    rawData.referenceIds = formData.getAll('referenceIds');
    rawData.activeDays = formData.getAll('activeDays');
    rawData.orderTypes = formData.getAll('orderTypes');
    rawData.tags = formData.getAll('tags');

    // Handle boolean fields correctly (if checkbox is not checked, it won't be in formData)
    rawData.isActive = formData.has('isActive');
    rawData.allowStacking = formData.has('allowStacking');
    rawData.assignToOfferCategory = formData.has('assignToOfferCategory');

    // Handle JSON fields
    rawData.activeTimeSlots = JSON.parse(formData.get('activeTimeSlots') as string || '[]');

    // Handle optional numbers: convert empty strings to undefined so Zod doesn't try to coerce them
    if (rawData.minOrderValue === '') rawData.minOrderValue = undefined;
    if (rawData.discountValue === '') rawData.discountValue = undefined;
    
    const validatedFields = standardDiscountSchema.safeParse(rawData);
    
    if (!validatedFields.success) {
      console.log('Validation failed:', validatedFields.error.flatten().fieldErrors);
      return {
        message: 'Validation failed. Please check the form for errors.',
        error: true,
        errors: validatedFields.error.issues,
      };
    }
    
    const { id, ...discountData } = validatedFields.data;
    
    const docId = id || doc(collection(db, 'standard_discounts')).id;

    const dataToSave: any = {
        ...discountData,
        id: docId,
        startDate: discountData.startDate ? Timestamp.fromDate(new Date(discountData.startDate)) : null,
        endDate: discountData.endDate ? Timestamp.fromDate(new Date(discountData.endDate)) : null,
        updatedAt: Timestamp.now(),
    };
    
    if (!id) {
      dataToSave.createdAt = Timestamp.now();
    }
    
    Object.keys(dataToSave).forEach(key => dataToSave[key] === undefined && delete dataToSave[key]);

    await setDoc(doc(db, 'standard_discounts', docId), dataToSave, { merge: true });

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save discount: ${errorMessage}`, error: true };
  }

  revalidatePath('/superadmin/standard-discounts');
  redirect('/superadmin/standard-discounts');
}

export async function deleteStandardDiscount(id: string) {
    try {
        await deleteDoc(doc(db, "standard_discounts", id));
        revalidatePath("/superadmin/standard-discounts");
        return { message: "Discount deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete discount: ${errorMessage}`, error: true };
    }
}

export async function getStandardDiscounts(): Promise<StandardDiscount[]> {
  const q = query(collection(db, 'standard_discounts'), orderBy('discountName'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    return { 
      ...data,
      id: doc.id,
      startDate: data.startDate?.toDate(),
      endDate: data.endDate?.toDate(),
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    } as StandardDiscount;
  });
}

// Type for serialized discount data for client components
export type SerializedStandardDiscount = Omit<StandardDiscount, 'startDate' | 'endDate' | 'createdAt' | 'updatedAt'> & {
    startDate?: string;
    endDate?: string;
    createdAt?: string;
    updatedAt?: string;
};


export async function getStandardDiscountById(id: string): Promise<SerializedStandardDiscount | null> {
    const docRef = doc(db, 'standard_discounts', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return { 
            ...(data as StandardDiscount),
            id: docSnap.id,
            referenceIds: data.referenceIds || [], // Ensure referenceIds is always an array
            startDate: data.startDate?.toDate().toISOString(),
            endDate: data.endDate?.toDate().toISOString(),
            createdAt: data.createdAt?.toDate().toISOString(),
            updatedAt: data.updatedAt?.toDate().toISOString(),
        };
    }
    return null;
}

type ActiveStandardDiscountParams = {
  brandId: string;
  locationId: string;
  deliveryType: 'delivery' | 'pickup';
  // Add pickupTime for future implementation. For now, it's optional.
  pickupTime?: Date; 
  // Allow passing a list of discounts for testing purposes
  discountsForTest?: StandardDiscount[];
};

export async function getActiveStandardDiscounts({ brandId, locationId, deliveryType, pickupTime, discountsForTest }: ActiveStandardDiscountParams): Promise<StandardDiscount[]> {
  const now = new Date();
  
  // NOTE: For now, pickupTime and dispatchTime are theoretical.
  // We use `now` as a placeholder for these future values.
  // The logic is structured to easily accommodate them when the checkout flow is updated.
  const validationTime = pickupTime || now; // Use chosen pickup time if available, otherwise current time.
  const validationTimeDay = validationTime.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();

  let allDiscountsForBrand: StandardDiscount[];

  if (discountsForTest) {
    allDiscountsForBrand = discountsForTest;
  } else {
    const q = query(
      collection(db, 'standard_discounts'), 
      where('brandId', '==', brandId),
      where('locationIds', 'array-contains', locationId),
      where('isActive', '==', true)
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) return [];

    allDiscountsForBrand = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        startDate: data.startDate?.toDate(),
        endDate: data.endDate?.toDate(),
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      } as StandardDiscount
    });
  }
  
  // Filter by delivery type, date, day, and time in code
  const activeNowDiscounts = allDiscountsForBrand.filter(discount => {
      if (!discount.orderTypes.includes(deliveryType)) return false;
      
      // Use 'now' for date range validation regardless of type
      if (discount.startDate && now < discount.startDate) return false;
      if (discount.endDate && now > discount.endDate) return false;

      // Determine which day to check against based on validation type
      const dayToCheck = discount.timeSlotValidationType === 'pickupTime' ? validationTimeDay : now.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
      if ((discount.activeDays || []).length > 0 && !(discount.activeDays || []).includes(dayToCheck)) return false;

      // Determine which time to check against
      const timeToCheck = discount.timeSlotValidationType === 'pickupTime' ? validationTime : now;

      if ((discount.activeTimeSlots || []).length > 0) {
          const currentTimeString = timeToCheck.toTimeString().slice(0,5);
          const inActiveTime = discount.activeTimeSlots.some(slot => currentTimeString >= slot.start && currentTimeString <= slot.end);
          if(!inActiveTime) return false;
      }
      return true;
  });

  return activeNowDiscounts;
}

export async function updateStandardDiscountStatus(id: string, isActive: boolean) {
    try {
        const discountRef = doc(db, "standard_discounts", id);
        await updateDoc(discountRef, { isActive });
        revalidatePath('/superadmin/standard-discounts');
        return { success: true };
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'Failed to update status.';
        return { success: false, error: errorMessage };
    }
}
