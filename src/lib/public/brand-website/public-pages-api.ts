'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsitePage, BrandWebsitePageSummary } from '@/lib/types/brandWebsite';
import { brandWebsitePageSlugSchema, brandWebsitePageBaseSchema } from '@/lib/superadmin/brand-website/pages-schemas';
import type { Timestamp } from 'firebase-admin/firestore';

const pagesCollectionPath = (brandId: string) => `brands/${brandId}/website/pages`;

export async function getPublicBrandWebsitePages(brandId: string): Promise<BrandWebsitePageSummary[]> {
    const db = getAdminDb();
    const q = db.collection(pagesCollectionPath(brandId)).where('isPublished', '==', true);
    const snapshot = await q.get();

    const pages: BrandWebsitePageSummary[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            slug: doc.id,
            title: data.title || 'Untitled',
            isPublished: data.isPublished,
            sortOrder: data.sortOrder,
            updatedAt: (data.updatedAt as Timestamp)?.toDate() || null,
        };
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

export async function getPublicBrandWebsitePageBySlug(brandId: string, slug: string): Promise<BrandWebsitePage | null> {
    const slugValidation = brandWebsitePageSlugSchema.safeParse(slug);
    if (!slugValidation.success) {
        return null;
    }

    const db = getAdminDb();
    const docRef = db.doc(`${pagesCollectionPath(brandId)}/${slug}`);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
        return null;
    }

    const data = docSnap.data();

    if (data?.isPublished !== true) {
        return null;
    }
    
    const validatedData = brandWebsitePageBaseSchema.partial().parse(data);

    return {
        slug: validatedData.slug || slug,
        title: validatedData.title || '',
        subtitle: validatedData.subtitle,
        layout: validatedData.layout || 'rich-text-left-image-right',
        body: validatedData.body || '',
        imageUrl: validatedData.imageUrl,
        cta: validatedData.cta,
        seo: validatedData.seo,
        sortOrder: validatedData.sortOrder,
        isPublished: validatedData.isPublished || false,
        createdAt: (data?.createdAt as Timestamp)?.toDate() || null,
        updatedAt: (data?.updatedAt as Timestamp)?.toDate() || null,
    };
}
