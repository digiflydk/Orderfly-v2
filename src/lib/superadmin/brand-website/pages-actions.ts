
'use server';

import { getAdminDb, admin } from '@/lib/firebase-admin';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import type { BrandWebsitePage, BrandWebsitePageSummary, BrandWebsitePageCreateInput, BrandWebsitePageUpdateInput } from '@/lib/types/brandWebsite';
import { brandWebsitePageCreateSchema, brandWebsitePageSlugSchema, brandWebsitePageUpdateSchema } from './pages-schemas';
import { logBrandWebsiteAuditEntry } from './brand-website-audit';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';

const pagesCollectionPath = (brandId: string) => `brands/${brandId}/websitePages`;

export async function listBrandWebsitePages(brandId: string): Promise<BrandWebsitePageSummary[]> {
    const start = Date.now();
    const action = 'listBrandWebsitePages';
    const path = pagesCollectionPath(brandId);
    try {
        await requireSuperadmin();
        const db = getAdminDb();
        const snapshot = await db.collection(path).get();

        const pages = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                slug: doc.id,
                title: data.title || 'Untitled',
                isPublished: data.isPublished || false,
                sortOrder: data.sortOrder,
                updatedAt: data.updatedAt,
            } as BrandWebsitePageSummary;
        });

        const sortedPages = pages.sort((a, b) => {
            const orderA = a.sortOrder ?? Infinity;
            const orderB = b.sortOrder ?? Infinity;
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            return a.title.localeCompare(b.title);
        });

        await logBrandWebsiteApiCall({
            layer: 'cms', action, brandId, status: 'success', durationMs: Date.now() - start, path
        });
        return sortedPages;

    } catch (error: any) {
        await logBrandWebsiteApiCall({
            layer: 'cms', action, brandId, status: 'error', durationMs: Date.now() - start, path, errorMessage: error?.message ?? 'Unknown error'
        });
        throw error;
    }
}

export async function getBrandWebsitePage(brandId: string, slug: string): Promise<BrandWebsitePage | null> {
    const start = Date.now();
    const action = 'getBrandWebsitePage';
    const path = `${pagesCollectionPath(brandId)}/${slug}`;
    try {
        await requireSuperadmin();
        brandWebsitePageSlugSchema.parse(slug);

        const db = getAdminDb();
        const docRef = db.doc(path);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            await logBrandWebsiteApiCall({ layer: 'cms', action, brandId, status: 'success', durationMs: Date.now() - start, path });
            return null;
        }

        const data = docSnap.data() as Partial<BrandWebsitePage>;
        const result: BrandWebsitePage = {
            slug: docSnap.id,
            title: data.title || '',
            layout: data.layout || 'rich-text-left-image-right',
            body: data.body || '',
            isPublished: data.isPublished || false,
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
            ...data,
        };
        await logBrandWebsiteApiCall({ layer: 'cms', action, brandId, status: 'success', durationMs: Date.now() - start, path });
        return result;
    } catch(error: any) {
        await logBrandWebsiteApiCall({ layer: 'cms', action, brandId, status: 'error', durationMs: Date.now() - start, path, errorMessage: error?.message ?? 'Unknown error'});
        throw error;
    }
}

export async function createBrandWebsitePage(brandId: string, input: BrandWebsitePageCreateInput): Promise<BrandWebsitePage> {
    const action = 'createBrandWebsitePage';
    const validatedSlug = brandWebsitePageSlugSchema.safeParse(input.slug);
    const slug = validatedSlug.success ? validatedSlug.data : 'invalid-slug';
    const path = `${pagesCollectionPath(brandId)}/${slug}`;
    const start = Date.now();

    try {
        await requireSuperadmin();
        const validated = brandWebsitePageCreateSchema.parse(input);
        
        const db = getAdminDb();
        const docRef = db.doc(path);

        const existingDoc = await docRef.get();
        if (existingDoc.exists) {
            throw new Error('A page with this slug already exists.');
        }

        const now = admin.firestore.FieldValue.serverTimestamp();
        const newPage: Omit<BrandWebsitePage, 'createdAt' | 'updatedAt'> & { createdAt: any; updatedAt: any } = {
            slug: validated.slug,
            title: validated.title,
            subtitle: validated.subtitle ?? undefined,
            layout: validated.layout,
            body: validated.body,
            imageUrl: validated.imageUrl ?? undefined,
            cta: validated.cta ?? null,
            seo: validated.seo ?? {},
            sortOrder: validated.sortOrder ?? undefined,
            isPublished: validated.isPublished ?? false,
            createdAt: now,
            updatedAt: now,
        };

        await docRef.set(newPage);

        await logBrandWebsiteAuditEntry({
            brandId,
            entity: 'page',
            entityId: validated.slug,
            action: 'create',
            changedFields: Object.keys(validated),
            path: path,
        });
        
        await logBrandWebsiteApiCall({ layer: 'cms', action, brandId, status: 'success', durationMs: Date.now() - start, path });
        
        const createdDoc = await docRef.get();
        return createdDoc.data() as BrandWebsitePage;

    } catch(error: any) {
        await logBrandWebsiteApiCall({ layer: 'cms', action, brandId, status: 'error', durationMs: Date.now() - start, path, errorMessage: error?.message ?? 'Unknown error'});
        throw error;
    }
}

export async function updateBrandWebsitePage(brandId: string, slug: string, input: BrandWebsitePageUpdateInput): Promise<BrandWebsitePage> {
    const start = Date.now();
    const action = 'updateBrandWebsitePage';
    let path = `${pagesCollectionPath(brandId)}/${slug}`;
    try {
        await requireSuperadmin();
        brandWebsitePageSlugSchema.parse(slug);
        const validatedInput = brandWebsitePageUpdateSchema.parse(input);
        
        const db = getAdminDb();
        const collectionRef = db.collection(pagesCollectionPath(brandId));
        const originalDocRef = collectionRef.doc(slug);
        const originalDoc = await originalDocRef.get();
        
        if (!originalDoc.exists) {
            throw new Error("Page not found");
        }

        const newSlug = validatedInput.slug;
        
        if (newSlug && newSlug !== slug) {
            path = `${pagesCollectionPath(brandId)}/${newSlug}`;
            const newDocRef = collectionRef.doc(newSlug);
            const newDoc = await newDocRef.get();
            if (newDoc.exists) {
                throw new Error("A page with the new slug already exists.");
            }
            
            const batch = db.batch();
            const updatedData = {
                ...originalDoc.data(),
                ...validatedInput,
                slug: newSlug,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            batch.set(newDocRef, updatedData);
            batch.delete(originalDocRef);
            await batch.commit();

            await logBrandWebsiteAuditEntry({
                brandId,
                entity: 'page',
                entityId: newSlug,
                action: 'update',
                changedFields: Object.keys(validatedInput),
                path: path,
            });
            
            await logBrandWebsiteApiCall({ layer: 'cms', action, brandId, status: 'success', durationMs: Date.now() - start, path });
            const resultDoc = await newDocRef.get();
            return resultDoc.data() as BrandWebsitePage;
        } else {
            const dataToUpdate = {
                ...validatedInput,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            await originalDocRef.update(dataToUpdate);

            await logBrandWebsiteAuditEntry({
                brandId,
                entity: 'page',
                entityId: slug,
                action: 'update',
                changedFields: Object.keys(validatedInput),
                path: path,
            });
            
            await logBrandWebsiteApiCall({ layer: 'cms', action, brandId, status: 'success', durationMs: Date.now() - start, path });
            const updatedDoc = await originalDocRef.get();
            return updatedDoc.data() as BrandWebsitePage;
        }
    } catch(error: any) {
        await logBrandWebsiteApiCall({ layer: 'cms', action, brandId, status: 'error', durationMs: Date.now() - start, path, errorMessage: error?.message ?? 'Unknown error'});
        throw error;
    }
}

export async function deleteBrandWebsitePage(brandId: string, slug: string): Promise<void> {
    const start = Date.now();
    const action = 'deleteBrandWebsitePage';
    const path = `${pagesCollectionPath(brandId)}/${slug}`;
    try {
        await requireSuperadmin();
        brandWebsitePageSlugSchema.parse(slug);

        const db = getAdminDb();
        const docRef = db.doc(path);
        await docRef.delete();

        await logBrandWebsiteAuditEntry({
            brandId,
            entity: 'page',
            entityId: slug,
            action: 'delete',
            changedFields: [],
            path: path,
        });
        await logBrandWebsiteApiCall({ layer: 'cms', action, brandId, status: 'success', durationMs: Date.now() - start, path });
    } catch(error: any) {
        await logBrandWebsiteApiCall({ layer: 'cms', action, brandId, status: 'error', durationMs: Date.now() - start, path, errorMessage: error?.message ?? 'Unknown error'});
        throw error;
    }
}
