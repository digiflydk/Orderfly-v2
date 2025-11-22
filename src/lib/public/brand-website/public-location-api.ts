'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';

type PublicLocationData = {
    locationId: string;
    title: string;
    address: string;
    openingHours: any; // Using `any` for simplicity, could be a structured type
    phone?: string;
};

/**
 * Fetches public-safe location data for a brand.
 *
 * @param brandId The ID of the brand.
 * @returns An array of public location data.
 */
export async function getPublicBrandLocationData(brandId: string): Promise<PublicLocationData[]> {
    const db = getAdminDb();
    const locationsQuery = db.collection('brands').doc(brandId).collection('locations').where('isActive', '==', true);
    
    const snapshot = await locationsQuery.get();
    
    if (snapshot.empty) {
        return [];
    }

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            locationId: doc.id,
            title: data.name,
            address: data.address,
            openingHours: data.openingHours,
            phone: data.phone,
        };
    });
}
