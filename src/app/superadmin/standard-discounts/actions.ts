
'use server';

import { isQuantityMethod } from '@/lib/automatic-discounts';
import { restaurantClock } from '@/lib/promotion-rules';
import { revalidatePath, revalidateTag } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, Timestamp, getDoc, where, documentId, updateDoc } from 'firebase/firestore';
import type { StandardDiscount, CartItem, Product, ProductForMenu } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';

import { standardDiscountSchema } from '@/lib/standard-discount-schema';




export type FormState = {
	message: string;
	error: boolean;
	errors?: z.ZodIssue[];
};

export type StandardDiscountActionResult = {
	success: boolean;
	message?: string;
	error?: string;
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
		if (rawData.discountValue === '' || isQuantityMethod(rawData.discountMethod) || rawData.discountType === 'free_delivery') rawData.discountValue = undefined;
        for (const key of ['buyQuantity', 'payQuantity', 'bundlePrice']) if (rawData[key] === '') delete rawData[key];
        if (!['buy_x_pay_y', 'bundle_price'].includes(rawData.discountMethod)) delete rawData.buyQuantity;
        if (rawData.discountMethod !== 'buy_x_pay_y') delete rawData.payQuantity;
        if (rawData.discountMethod !== 'bundle_price') delete rawData.bundlePrice;
        rawData.quantityTiers = rawData.discountMethod === 'quantity_tiers' ? JSON.parse(String(formData.get('quantityTiers') || '[]')) : undefined;

        for (const key of ['startDate', 'endDate']) rawData[key] = rawData[key] ? new Date(rawData[key]) : undefined;
        if (isQuantityMethod(rawData.discountMethod)) rawData.allowStacking = false;
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
        if (!(await getDoc(doc(db, 'brands', discountData.brandId))).exists()) throw new Error('Brand not found.');
        if (id) {
          const existing = await getDoc(doc(db, 'standard_discounts', id));
          if (!existing.exists() || existing.data().brandId !== discountData.brandId) throw new Error('Discount not found for this brand.');
        }
        for (const locationId of discountData.locationIds) {
          const location = await getDoc(doc(db, 'locations', locationId));
          if (!location.exists() || location.data().brandId !== discountData.brandId) throw new Error('Location does not belong to this brand.');
        }
        if (discountData.discountType === 'product' || discountData.discountType === 'category') {
          const collectionName = discountData.discountType === 'product' ? 'products' : 'categories';
          for (const ref of discountData.referenceIds) {
            const record = await getDoc(doc(db, collectionName, ref));
            if (!record.exists()) throw new Error('Selected product or category does not exist.');
            const value = record.data();
            // Categories derive ownership from locations; they do not store brandId.
            const matches = discountData.discountType === 'category'
              ? discountData.locationIds.some(loc => (value.locationIds || []).includes(loc))
              : value.brandId === discountData.brandId;
            if (!matches) throw new Error('Selected product or category does not belong to this brand/location.');
          }
        }

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
    revalidateTag('storefront');
	redirect('/superadmin/standard-discounts');
}

export async function deleteStandardDiscount(id: string): Promise<StandardDiscountActionResult> {
	try {
		await deleteDoc(doc(db, "standard_discounts", id));
		revalidatePath("/superadmin/standard-discounts");
    revalidateTag('storefront');
		return { success: true, message: "Discount deleted successfully." };
	} catch (e) {
		console.error(e);
		const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
		return { success: false, error: `Failed to delete discount: ${errorMessage}` };
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
	const validationTimeDay = restaurantClock(validationTime).day;

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
				createdAt: data.createdAt?.toDate(),
				updatedAt: data.updatedAt?.toDate(),
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
		const dayToCheck = discount.timeSlotValidationType === 'pickupTime' ? validationTimeDay : restaurantClock(now).day;
		if ((discount.activeDays || []).length > 0 && !(discount.activeDays || []).includes(dayToCheck)) return false;

		// Determine which time to check against
		const timeToCheck = discount.timeSlotValidationType === 'pickupTime' ? validationTime : now;

		if ((discount.activeTimeSlots || []).length > 0) {
			const currentTimeString = restaurantClock(timeToCheck).time;
			const inActiveTime = discount.activeTimeSlots.some(slot => currentTimeString >= slot.start && currentTimeString <= slot.end);
			if (!inActiveTime) return false;
		}
		return true;
	});

	return activeNowDiscounts;
}

export async function updateStandardDiscountStatus(id: string, isActive: boolean): Promise<StandardDiscountActionResult> {
	try {
		const discountRef = doc(db, "standard_discounts", id);
		await updateDoc(discountRef, { isActive });
		revalidatePath('/superadmin/standard-discounts');
    revalidateTag('storefront');
		return { success: true, message: 'Standard discount status updated successfully.' };
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : 'Failed to update status.';
		return { success: false, error: errorMessage };
	}
}
