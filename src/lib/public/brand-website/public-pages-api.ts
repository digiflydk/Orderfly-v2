'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsitePage, BrandWebsitePageSummary } from '@/lib/types/brandWebsite';

const pagesCollectionPath = (brandId: string) => `brands/${brandId}/website/pages`;

/**
 * Lists all *published* custom pages for a brand, sorted by sortOrder and then title.
 *
 * @param brandId The ID of the brand.
 * @returns An array of page summaries.
 */
export async function getPublicBrandWebsitePages(brandId: string): Promise<BrandWebsitePageSummary[]> {
    const db = getAdminDb();
    const snapshot = await db.collection(pagesCollectionPath(brandId))
                           .where('isPublished', '==', true)
                           .get();

    if (snapshot.empty) {
        return [];
    }

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

    return pages.sort((a, b) => {
        const orderA = a.sortOrder ?? Infinity;
        const orderB = b.sortOrder ?? Infinity;
        if (orderA !== orderB) {
            return orderA - orderB;
        }
        return a.title.localeCompare(b.title);
    });
}

/**
 * Retrieves a single *published* custom page by its slug for a given brand.
 *
 * @param brandId The ID of the brand.
 * @param slug The slug of the page.
 * @returns The page data if found and published, otherwise null.
 */
export async function getPublicBrandWebsitePageBySlug(brandId: string, slug: string): Promise<BrandWebsitePage | null> {
    const db = getAdminDb();
    const docRef = db.doc(`${pagesCollectionPath(brandId)}/${slug}`);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
        return null;
    }

    const data = docSnap.data() as Partial<BrandWebsitePage>;
    
    // Crucially, only return if it's published
    if (!data.isPublished) {
        return null;
    }

    return {
        slug: docSnap.id,
        title: data.title || '',
        layout: data.layout || 'rich-text-left-image-right',
        body: data.body || '',
        isPublished: data.isPublished,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        ...data,
    } as BrandWebsitePage;
}
