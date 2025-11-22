'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Category, Product } from '@/types';

type PublicMenuCategory = Pick<Category, 'id' | 'categoryName' | 'description' | 'icon' | 'sortOrder'>;
type PublicMenuProduct = Pick<Product, 'id' | 'productName' | 'description' | 'price' | 'priceDelivery' | 'imageUrl' | 'categoryId'>;

/**
 * Fetches all active products and categories for a given brand.
 *
 * @param brandId The ID of the brand.
 * @returns An object containing arrays of active categories and products.
 */
export async function getPublicBrandMenuData(brandId: string): Promise<{ categories: PublicMenuCategory[]; products: PublicMenuProduct[]; }> {
    const db = getAdminDb();
    
    const categoriesQuery = db.collection('brands').doc(brandId).collection('categories').where('isActive', '==', true);
    const productsQuery = db.collection('brands').doc(brandId).collection('menus').doc('main').collection('products').where('isActive', '==', true);
    
    const [categoriesSnap, productsSnap] = await Promise.all([
        categoriesQuery.get(),
        productsQuery.get(),
    ]);

    const allProducts = productsSnap.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            productName: data.productName,
            description: data.description,
            price: data.price,
            priceDelivery: data.priceDelivery,
            imageUrl: data.imageUrl,
            categoryId: data.categoryId,
        } as PublicMenuProduct;
    });

    const activeCategoryIds = new Set(allProducts.map(p => p.categoryId));
    
    const activeCategories = categoriesSnap.docs
        .map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                categoryName: data.categoryName,
                description: data.description,
                icon: data.icon,
                sortOrder: data.sortOrder,
            } as PublicMenuCategory;
        })
        .filter(cat => activeCategoryIds.has(cat.id))
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

    allProducts.sort((a,b) => ((a as any).sortOrder ?? 999) - ((b as any).sortOrder ?? 999));
    
    return {
        categories: activeCategories,
        products: allProducts,
    };
}
