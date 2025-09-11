

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, orderBy, getDoc, limit } from 'firebase/firestore';
import type { Location, Brand, TimeSlotResponse } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { addMinutes, format, startOfMinute, isBefore, isEqual, roundToNearestMinutes, addDays, set, parseISO, startOfDay, isToday, isSameDay, isAfter, isSameMinute, subMinutes } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

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
    const locationRef = id ? doc(db, 'locations', id) : doc(collection(db, 'locations'));
    const finalData: any = { ...locationData, address, id: locationRef.id };
    
    // Ensure undefined is not sent to Firestore if it's optional and not set
    if (finalData.manual_override === undefined) {
        delete finalData.manual_override;
    }

    await setDoc(locationRef, finalData, { merge: true });

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
        await deleteDoc(doc(db, "locations", locationId));
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
    const q = query(
        collection(db, 'locations'),
        where('brandId', '==', brandId),
        where('isActive', '==', true),
    );
    const querySnapshot = await getDocs(q);
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

export async function getLocationBySlug(brandId: string, locationSlug: string): Promise<Location | null> {
    const q = query(
        collection(db, 'locations'),
        where('brandId', '==', brandId)
    );
    const querySnapshot = await getDocs(q);
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

export async function getLocationsForBrand(brandId: string): Promise<Location[]> {
    const q = query(collection(db, 'locations'), where('brandId', '==', brandId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Location[];
}

export async function getAllLocations(brandId?: string): Promise<Location[]> {
    let q;
    if (brandId) {
        q = query(collection(db, 'locations'), where('brandId', '==', brandId), orderBy('name'));
    } else {
        q = query(collection(db, 'locations'), orderBy('name'));
    }
    const querySnapshot = await getDocs(q);
    const locations = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Location[];
    
    return locations.map(location => ({
        ...location,
        supportsDelivery: location.deliveryTypes.includes('delivery'),
        supportsPickup: location.deliveryTypes.includes('pickup'),
    }));
}


export async function getLocationById(locationId: string): Promise<Location | null> {
    const docRef = doc(db, 'locations', locationId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
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

    const tidsinterval = 5;
    const timeZone = 'Europe/Copenhagen';
    const now = toZonedTime(new Date(), timeZone);
    const forDate = forDateStr ? startOfDay(toZonedTime(parseISO(forDateStr), timeZone)) : startOfDay(now);

    const getDayInfo = (date: Date) => {
        const dayOfWeek = format(date, 'eeee').toLowerCase() as keyof Location['openingHours'];
        const hours = location.openingHours[dayOfWeek];
        if (!hours || !hours.isOpen) return null;

        const [openHour, openMinute] = hours.open.split(':').map(Number);
        const [closeHour, closeMinute] = hours.close.split(':').map(Number);

        let openingTime = set(date, { hours: openHour, minutes: openMinute, seconds: 0, milliseconds: 0 });
        let closingTime = set(date, { hours: closeHour, minutes: closeMinute, seconds: 0, milliseconds: 0 });

        if (isBefore(closingTime, openingTime)) {
            closingTime = addDays(closingTime, 1);
        }
        
        return { openingTime, closingTime };
    };

    const generateSlots = (earliest: Date, latest: Date): string[] => {
        if (isAfter(earliest, latest)) return [];
        const slots = [];
        let current = roundToNearestMinutes(earliest, { nearestTo: tidsinterval });
        if (isBefore(current, earliest)) {
            current = addMinutes(current, tidsinterval);
        }
        while (isBefore(current, latest) || isEqual(current, latest)) {
            slots.push(format(current, 'HH:mm'));
            current = addMinutes(current, tidsinterval);
        }
        return slots;
    };
    
    let effectivePrep = (location.manual_override ?? 0) > 0 
      ? (location.manual_override ?? 0)
      : (location.prep_time ?? 0); // Ensure prep_time has a fallback

    if (!location.manual_override || location.manual_override === 0) {
        if (location.travlhed_factor === 'medium') effectivePrep += 10;
        if (location.travlhed_factor === 'høj') effectivePrep += 20;
    }
    
    let pickup_times: string[] = [];
    let delivery_times: string[] = [];
    let asap_pickup = '';
    let asap_delivery = '';

    const dayInfo = getDayInfo(forDate);

    if (dayInfo) {
        const { openingTime, closingTime } = dayInfo;
        const lastPossiblePickupTime = subMinutes(closingTime, effectivePrep);
        const lastPossibleDeliveryTime = subMinutes(closingTime, effectivePrep + location.delivery_time);

        const dateIsToday = isToday(forDate);
        const isCurrentlyOpen = dateIsToday && isAfter(now, openingTime) && isBefore(now, closingTime);
        const isBeforeOpening = dateIsToday && isBefore(now, openingTime);

        // Pickup Logic
        if (location.deliveryTypes.includes('pickup')) {
            const earliestPickupTime = addMinutes(isCurrentlyOpen ? now : openingTime, effectivePrep);

            if (isAfter(earliestPickupTime, lastPossiblePickupTime)) {
                // No slots available
            } else if (isCurrentlyOpen) {
                asap_pickup = `ASAP (${effectivePrep}-${effectivePrep + 5} min)`;
            } else if (isBeforeOpening) {
                asap_pickup = `I dag - ${format(addMinutes(openingTime, effectivePrep), 'HH:mm')}`;
            } else if (!dateIsToday) {
                asap_pickup = `${format(forDate, 'eee, MMM d')} - ${format(addMinutes(openingTime, effectivePrep), 'HH:mm')}`;
            }
            pickup_times = generateSlots(earliestPickupTime, lastPossiblePickupTime);
        }
        
        // Delivery Logic
        if (location.deliveryTypes.includes('delivery')) {
            const earliestDeliveryTime = addMinutes(isCurrentlyOpen ? now : openingTime, effectivePrep + location.delivery_time);
            
            if (isAfter(earliestDeliveryTime, lastPossibleDeliveryTime)) {
                // No slots available
            } else if (isCurrentlyOpen) {
                asap_delivery = `ASAP (${effectivePrep + location.delivery_time}-${effectivePrep + location.delivery_time + 5} min)`;
            } else if (isBeforeOpening) {
                asap_delivery = `I dag - ${format(addMinutes(openingTime, effectivePrep + location.delivery_time), 'HH:mm')}`;
            } else if (!dateIsToday) {
                asap_delivery = `${format(forDate, 'eee, MMM d')} - ${format(addMinutes(openingTime, effectivePrep + location.delivery_time), 'HH:mm')}`;
            }
            delivery_times = generateSlots(earliestDeliveryTime, lastPossibleDeliveryTime);
        }
    }
    
    // Handle case where restaurant is closed for the day
    if (pickup_times.length === 0 && delivery_times.length === 0 && (!asap_pickup && !asap_delivery)) {
        for (let i = 1; i <= 7; i++) {
            const nextDate = addDays(forDate, i);
            const nextDayInfo = getDayInfo(nextDate);
            if (nextDayInfo) {
                return { 
                    tidsinterval, 
                    pickup_times: [], 
                    delivery_times: [], 
                    asap_pickup: `I morgen - ${format(addMinutes(nextDayInfo.openingTime, effectivePrep), 'HH:mm')}`, 
                    asap_delivery: `I morgen - ${format(addMinutes(nextDayInfo.openingTime, effectivePrep + location.delivery_time), 'HH:mm')}`,
                    nextAvailableDate: format(nextDate, 'eeee, MMM d'),
                };
            }
        }
    }

    return { tidsinterval, pickup_times, delivery_times, asap_pickup, asap_delivery };
}

    
