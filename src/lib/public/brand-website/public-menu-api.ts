'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';

async function getCategoriesForBrand(brandId: string) {
    const db = getAdminDb();
    const q = db.collection('categories').where('brandId', '==', brandId);
    const snapshot = await q.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getProductsForBrand(brandId: string) {
    const db = getAdminDb();
    const q = db.collection('products').where('brandId', '==', brandId).where('isActive', '==', true);
    const snapshot = await q.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getPublicBrandMenuData(brandId: string): Promise<{ categories: any[]; products: any[] }> {
    const [allCategories, allProducts] = await Promise.all([
        getCategoriesForBrand(brandId),
        getProductsForBrand(brandId),
    ]);

    const activeProductCategoryIds = new Set(allProducts.map(p => p.categoryId));
    
    const categoriesWithProducts = allCategories
        .filter(c => activeProductCategoryIds.has(c.id))
        .map(c => ({
            id: c.id,
            name: c.categoryName,
            sortOrder: c.sortOrder,
        }))
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
        
    const products = allProducts
        .map(p => ({
            id: p.id,
            productId: p.id,
            title: p.productName,
            name: p.productName,
            description: p.description,
            price: p.price,
            categoryId: p.categoryId,
            sortOrder: p.sortOrder,
        }))
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

    return {
        categories: categoriesWithProducts,
        products: products,
    };
}
