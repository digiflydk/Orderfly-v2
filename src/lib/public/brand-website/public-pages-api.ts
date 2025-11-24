
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsitePage, BrandWebsitePageSummary } from '@/lib/types/brandWebsite';

const pagesCollectionPath = (brandId: string) => `brands/${brandId}/websitePages`;

export async function getPublicBrandWebsitePages(brandId: string): Promise<BrandWebsitePageSummary[]> {
    const db = getAdminDb();
    const q = db.collection(pagesCollectionPath(brandId))
        .where('isPublished', '==', true);
    
    const snapshot = await q.get();
    
    const pages = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            slug: doc.id,
            title: data.title || 'Untitled',
            isPublished: data.isPublished,
            sortOrder: data.sortOrder,
            updatedAt: data.updatedAt,
        } as BrandWebsitePageSummary;
    });

    return pages.sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity));
}

export async function getPublicBrandWebsitePageBySlug(brandId: string, slug: string): Promise<BrandWebsitePage | null> {
    const db = getAdminDb();
    const docRef = db.doc(`${pagesCollectionPath(brandId)}/${slug}`);
    const docSnap = await docRef.get();

    if (!docSnap.exists || !docSnap.data()?.isPublished) {
        return null;
    }
    
    const data = docSnap.data() as Partial<BrandWebsitePage>;
    return {
        slug: docSnap.id,
        title: data.title || '',
        layout: data.layout || 'rich-text-left-image-right',
        body: data.body || '',
        isPublished: data.isPublished || false,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        ...data,
    };
}
