
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsitePage, BrandWebsitePageSummary } from '@/lib/types/brandWebsite';
import { brandWebsitePageSlugSchema } from '@/lib/superadmin/brand-website/pages-schemas';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';

export async function getPublicBrandWebsitePages(brandId: string): Promise<BrandWebsitePageSummary[]> {
    const start = Date.now();
    const path = `/brands/${brandId}/website/pages`;
    try {
        const db = getAdminDb();
        const snapshot = await db.collection(path).where('isPublished', '==', true).get();
        
        const pages = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                slug: doc.id,
                title: data.title || 'Untitled',
                isPublished: data.isPublished || false,
                sortOrder: data.sortOrder,
                updatedAt: data.updatedAt,
            };
        });

        pages.sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || a.title.localeCompare(b.title));

        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsitePages', brandId, status: 'success', durationMs: Date.now() - start, path });
        return pages;
    } catch(error: any) {
        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsitePages', brandId, status: 'error', durationMs: Date.now() - start, path, errorMessage: error?.message ?? 'Unknown error' });
        return [];
    }
}

export async function getPublicBrandWebsitePageBySlug(brandId: string, slug: string): Promise<BrandWebsitePage | null> {
    const start = Date.now();
    const path = `/brands/${brandId}/website/pages/${slug}`;
    try {
        brandWebsitePageSlugSchema.parse(slug);

        const db = getAdminDb();
        const docSnap = await db.doc(path).get();

        if (!docSnap.exists || docSnap.data()?.isPublished !== true) {
            await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsitePageBySlug', brandId, status: 'success', durationMs: Date.now() - start, path });
            return null;
        }

        const data = docSnap.data() as Partial<BrandWebsitePage>;
        
        const page: BrandWebsitePage = {
            slug: docSnap.id,
            title: data.title || '',
            layout: data.layout || 'rich-text-left-image-right',
            body: data.body || '',
            isPublished: data.isPublished || false,
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
            subtitle: data.subtitle,
            imageUrl: data.imageUrl,
            cta: data.cta,
            seo: data.seo,
            sortOrder: data.sortOrder,
        };
        
        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsitePageBySlug', brandId, status: 'success', durationMs: Date.now() - start, path });
        return page;

    } catch(error: any) {
        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsitePageBySlug', brandId, status: 'error', durationMs: Date.now() - start, path, errorMessage: error?.message ?? 'Unknown error' });
        return null;
    }
}
