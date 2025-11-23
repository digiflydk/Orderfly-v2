
'use server';

import { getAdminDb } from '@/lib/firebase-admin';

export async function resolveBrandByDomain(domain: string): Promise<string | null> {
    if (!domain) return null;
    const db = getAdminDb();
    try {
        const snapshot = await db.collection('brands')
            .where('website.config.domains', 'array-contains', domain)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return null;
        }
        return snapshot.docs[0].id;
    } catch (error) {
        console.error("Error resolving brand by domain:", error);
        return null;
    }
}
