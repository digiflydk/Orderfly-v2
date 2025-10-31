
'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, where, getDoc, limit, writeBatch } from 'firebase/firestore';
import type { Location, Brand, TimeSlotResponse } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { addMinutes, format, startOfMinute, isBefore, isEqual, roundToNearestMinutes, addDays, set, parseISO, startOfDay, isToday, isSameDay, isAfter, isSameMinute } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import * as admin from 'firebase-admin';
import { calculateTimeSlots } from './client-actions';


const openingHoursSchema = z.object({
  isOpen: z.boolean().default(false),
  open: z.string(),
  close: z.string(),
});

const locationSchema = z.object({
  id: z.string().optional(),
  brandId: z.string().min(1, { message: 'Brand is required.' }),
  name: z.string().min(2, { message: 'Location name must be at least 2 characters.' }),
  slug: z.string().min(2, { message: 'Slug is required.' }),
  street: z.string().min(2, 'Street name is required.'),
  zipCode: z.string().min(2, 'PO Box / ZIP Code is required.'),
  city: z.string().min(2, 'City is required.'),
  country: z.string().min(2, 'Country is required.'),
  isActive: z.boolean().default(false),
  deliveryFee: z.coerce.number().min(0, { message: 'Delivery fee must be a positive number.' }),
  minOrder: z.coerce.number().min(0, { message: 'Minimum order must be a positive number.' }),
  imageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  smileyUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  deliveryTypes: z.array(z.enum(['delivery', 'pickup'])).min(1, { message: 'At least one delivery type is required.' }),
  openingHours: z.object({
    monday: openingHoursSchema,
    tuesday: openingHoursSchema,
    wednesday: openingHoursSchema,
    thursday: openingHoursSchema,
    friday: openingHoursSchema,
    saturday: openingHoursSchema,
    sunday: openingHoursSchema,
  }),
  allowPreOrder: z.boolean().default(false),
  prep_time: z.coerce.number().min(0),
  delivery_time: z.coerce.number().min(0),
  travlhed_factor: z.enum(['normal', 'medium', 'høj']),
  manual_override: z.coerce.number().min(0).optional().default(0),
  pickupSaveTag: z.string().optional(),
});


export type FormState = {
  message: string;
  error: boolean;
};

export async function createOrUpdateLocation(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
    
  const rawData: Record<string, any> = {
    openingHours: {},
    deliveryTypes: formData.getAll('deliveryTypes'),
    isActive: formData.has('isActive'),
    allowPreOrder: formData.has('allowPreOrder'),
  };

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  for (const [key, value] of formData.entries()) {
    const dayMatch = key.match(/openingHours\.(.+)\.(.+)/);
    if (dayMatch) {
      const [, day, field] = dayMatch;
      if (!rawData.openingHours[day]) rawData.openingHours[day] = {};
      rawData.openingHours[day][field] = value;
    } else if (!['openingHours', 'deliveryTypes', 'isActive', 'allowPreOrder'].some(prefix => key.startsWith(prefix))) {
      rawData[key] = value;
    }
  }

  // Ensure all days have isOpen property, even if checkbox is not checked
  days.forEach(day => {
    if (!rawData.openingHours[day]) rawData.openingHours[day] = {};
    rawData.openingHours[day].isOpen = formData.has(`openingHours.${day}.isOpen`);
  });

  // Manual slug generation if not provided
  if (!rawData.slug && rawData.name) {
    rawData.slug = (rawData.name as string).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
  }
   
  const manualOverrideValue = formData.get('manual_override');
  if (manualOverrideValue === null || manualOverrideValue === '') {
    rawData.manual_override = undefined; // Make it optional
  } else {
    rawData.manual_override = manualOverrideValue;
  }

  const validatedFields = locationSchema.safeParse(rawData);

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

  const { id, ...locationData } = validatedFields.data;
  const address = `${locationData.street}, ${locationData.zipCode} ${locationData.city}, ${locationData.country}`;

  try {
    const db = getAdminDb();
    const locationRef = id ? db.collection('locations').doc(id) : db.collection('locations').doc();
    const finalData: any = { ...locationData, address, id: locationRef.id };
    
    if (finalData.manual_override === undefined) {
        delete finalData.manual_override;
    }

    await locationRef.set(finalData, { merge: true });

  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save location: ${errorMessage}`, error: true };
  }
  
  revalidatePath(`/superadmin/locations`);
  redirect(`/superadmin/locations`);
}

export async function deleteLocation(locationId: string, brandId: string) {
    try {
        const db = getAdminDb();
        await db.collection("locations").doc(locationId).delete();
        revalidatePath(`/superadmin/locations`);
        revalidatePath(`/superadmin/locations/${brandId}`);
        return { message: "Location deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete location: ${errorMessage}`, error: true };
    }
}

export async function getActiveLocationBySlug(brandId: string, locationSlug: string): Promise<Location | null> {
    const db = getAdminDb();
    const q = db.collection('locations').where('brandId', '==', brandId).where('isActive', '==', true);
    const querySnapshot = await q.get();
    if (querySnapshot.empty) {
        return null;
    }
    const lowerCaseSlug = locationSlug.toLowerCase();
    const locationDoc = querySnapshot.docs.find(doc => doc.data().slug.toLowerCase() === lowerCaseSlug);

    if (locationDoc) {
        const data = locationDoc.data();
        return { id: locationDoc.id, ...data } as Location;
    }
    return null;
}

export async function getAllLocations(brandId?: string): Promise<Location[]> {
    const db = getAdminDb();
    let q: admin.firestore.Query = db.collection('locations');
    if (brandId) {
        q = q.where('brandId', '==', brandId);
    }
    q = q.orderBy('name');
    const querySnapshot = await q.get();
    const locations = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Location[];
    
    return locations.map(location => ({
        ...location,
        supportsDelivery: location.deliveryTypes.includes('delivery'),
        supportsPickup: location.deliveryTypes.includes('pickup'),
    }));
}


export async function getLocationById(locationId: string): Promise<Location | null> {
    const db = getAdminDb();
    const docRef = db.collection('locations').doc(locationId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        const data = docSnap.data();
        return { id: docSnap.id, ...data } as Location;
    }
    return null;
}

export async function getTimeSlots(locationId: string, forDateStr?: string): Promise<TimeSlotResponse> {
    const location = await getLocationById(locationId);
    if (!location) {
        throw new Error("Location not found");
    }
    return calculateTimeSlots(location, forDateStr);
}

