
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';

export async function getPublicBrandMenuData(brandId: string): Promise<{ categories: any[]; products: any[] }> {
    const start = Date.now();
    try {
        const db = getAdminDb();
        const categoriesSnap = await db.collection('brands').doc(brandId).collection('categories').get();
        const productsSnap = await db.collection('brands').doc(brandId).collection('menus').get();

        const activeProducts = productsSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter((p: any) => p.isActive === true)
            .map(p => ({
                id: p.id,
                title: p.title,
                description: p.description,
                price: p.price,
                categoryId: p.categoryId,
                sortOrder: p.sortOrder,
            }))
            .sort((a,b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
            
        const activeCategoryIds = new Set(activeProducts.map(p => p.categoryId));
        
        const categories = categoriesSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(c => activeCategoryIds.has(c.id))
            .map(c => ({
                id: c.id,
                title: c.name,
                sortOrder: c.sortOrder,
            }))
            .sort((a,b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandMenuData', brandId, status: 'success', durationMs: Date.now() - start, path: `/brands/${brandId}` });

        return { categories, products: activeProducts };

    } catch (error: any) {
         await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandMenuData', brandId, status: 'error', durationMs: Date.now() - start, path: `/brands/${brandId}`, errorMessage: error?.message ?? 'Unknown error' });
         return { categories: [], products: [] };
    }
}
