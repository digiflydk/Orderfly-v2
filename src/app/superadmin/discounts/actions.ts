

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, where, Timestamp, getDoc } from 'firebase/firestore';
import type { Discount } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';

const activeTimeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const discountSchema = z.object({
  id: z.string().optional(),
  brandId: z.string().min(1, 'A brand must be selected.'),
  locationIds: z.array(z.string()).min(1, 'At least one location must be selected.'),
  code: z.string().min(3, 'Code must be at least 3 characters.').transform(v => v.toUpperCase()),
  description: z.string().optional(),
  discountType: z.enum(['percentage', 'fixed_amount']),
  discountValue: z.coerce.number().positive('Discount value must be positive.'),
  minOrderValue: z.coerce.number().min(0).optional(),
  isActive: z.boolean().default(true),
  orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type must be selected.'),
  activeDays: z.array(z.string()).optional().default([]),
  activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  usageLimit: z.coerce.number().min(0, 'Usage limit must be 0 or more.'),
  perCustomerLimit: z.coerce.number().min(0, 'Per customer limit must be 0 or more.'),
  assignedToCustomerId: z.string().optional(),
  firstTimeCustomerOnly: z.boolean().default(false),
  allowStacking: z.boolean().default(false),
});

export type FormState = {
  message: string;
  error: boolean;
  errors?: z.ZodIssue[];
};

export async function createOrUpdateDiscount(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  try {
    const id = formData.get('id') as string | null;

    const rawData = {
        brandId: formData.get('brandId'),
        locationIds: formData.getAll('locationIds'),
        code: formData.get('code'),
        description: formData.get('description'),
        discountType: formData.get('discountType'),
        discountValue: formData.get('discountValue'),
        minOrderValue: formData.get('minOrderValue') || undefined,
        isActive: formData.has('isActive'),
        orderTypes: formData.getAll('orderTypes'),
        activeDays: formData.getAll('activeDays'),
        startDate: formData.get('startDate') || undefined,
        endDate: formData.get('endDate') || undefined,
        usageLimit: formData.get('usageLimit'),
        perCustomerLimit: formData.get('perCustomerLimit'),
        assignedToCustomerId: formData.get('assignedToCustomerId') || undefined,
        firstTimeCustomerOnly: formData.has('firstTimeCustomerOnly'),
        allowStacking: formData.has('allowStacking'),
        activeTimeSlots: JSON.parse((formData.get('activeTimeSlots') as string | null) || '[]'),
    };
    
    if (id) (rawData as any).id = id;
    
    const validatedFields = discountSchema.safeParse(rawData);
    
    if (!validatedFields.success) {
      console.error('Validation errors:', validatedFields.error.flatten());
      return {
        message: 'Validation failed. Please check the fields below for errors.',
        error: true,
        errors: validatedFields.error.issues,
      };
    }
    
    const { id: validatedId, ...discountData } = validatedFields.data;

    // Check for uniqueness
    const uniquenessQuery = query(
        collection(db, 'discounts'),
        where('brandId', '==', discountData.brandId),
        where('code', '==', discountData.code)
    );
    const existingSnapshot = await getDocs(uniquenessQuery);
    if (!existingSnapshot.empty) {
        const existingDoc = existingSnapshot.docs[0];
        if (existingDoc.id !== validatedId) {
            return { message: 'This discount code already exists for this brand.', error: true, errors: [{path: ['code'], message: 'This code is already in use.'}]};
        }
    }
    
    const docId = validatedId || doc(collection(db, 'discounts')).id;

    const dataToSave: any = {
        id: docId,
        ...discountData,
        startDate: discountData.startDate ? Timestamp.fromDate(new Date(discountData.startDate)) : undefined,
        endDate: discountData.endDate ? Timestamp.fromDate(new Date(discountData.endDate)) : undefined,
        updatedAt: Timestamp.now(),
        usedCount: id ? (await getDiscountById(id))?.usedCount ?? 0 : 0,
    };
    
    if (!id) {
      dataToSave.createdAt = Timestamp.now();
    }
    
    // Remove undefined fields to prevent Firestore errors
    Object.keys(dataToSave).forEach(key => dataToSave[key] === undefined && delete dataToSave[key]);

    await setDoc(doc(db, 'discounts', docId), dataToSave, { merge: true });

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    console.error('Error in createOrUpdateDiscount:', e);
    return { message: `Failed to save discount: ${errorMessage}`, error: true };
  }

  revalidatePath('/superadmin/discounts');
  redirect('/superadmin/discounts');
}

export async function deleteDiscount(id: string) {
    try {
        const discountRef = doc(db, "discounts", id);
        const discountSnap = await getDoc(discountRef);
        
        if (!discountSnap.exists()) {
            return { message: "Discount not found.", error: true };
        }
        
        const discountData = discountSnap.data();
        if (discountData.usedCount > 0) {
            return { message: "Cannot delete a discount that has been used. Please deactivate it instead.", error: true };
        }

        await deleteDoc(discountRef);
        revalidatePath("/superadmin/discounts");
        return { message: "Discount deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete discount: ${errorMessage}`, error: true };
    }
}

export async function getDiscounts(): Promise<Discount[]> {
  const q = query(collection(db, 'discounts'), orderBy('code'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    return { 
      ...data,
      id: doc.id,
      startDate: data.startDate?.toDate(),
      endDate: data.endDate?.toDate(),
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
    } as Discount;
  });
}

export async function getDiscountById(id: string): Promise<Discount | null> {
    const docRef = doc(db, 'discounts', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return { 
            ...data,
            id: docSnap.id,
            startDate: data.startDate?.toDate(),
            endDate: data.endDate?.toDate(),
            createdAt: data.createdAt.toDate(),
            updatedAt: data.updatedAt.toDate(),
        } as Discount;
    }
    return null;
}

export async function getDiscountByCode(code: string, brandId: string): Promise<Discount | null> {
  if (!code || !brandId) return null;

  const q = query(
    collection(db, 'discounts'),
    where('code', '==', code),
    where('brandId', '==', brandId)
  );
  
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    return null;
  }
  
  const data = querySnapshot.docs[0].data();
  // Return raw Date objects, they will be handled by the client
  return {
    ...data,
    id: querySnapshot.docs[0].id,
    startDate: data.startDate?.toDate(),
    endDate: data.endDate?.toDate(),
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
  } as Discount;
}

