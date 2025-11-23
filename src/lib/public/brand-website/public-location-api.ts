
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import type { Location } from '@/types';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';

export async function getPublicBrandLocationData(brandId: string): Promise<any[]> {
    const start = Date.now();
    const path = `/brands/${brandId}/locations`;
    try {
        const db = getAdminDb();
        const snapshot = await db.collection('brands').doc(brandId).collection('locations').get();
        
        const locations = snapshot.docs.map(doc => {
            const data = doc.data() as Location;
            return {
                locationId: doc.id,
                title: data.name,
                address: data.address,
                openingHours: data.openingHours,
                phone: null, // Assuming phone is not public
            };
        });

        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandLocationData', brandId, status: 'success', durationMs: Date.now() - start, path });
        return locations;
    } catch(error: any) {
        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandLocationData', brandId, status: 'error', durationMs: Date.now() - start, path, errorMessage: error?.message ?? 'Unknown error' });
        return [];
    }
}
