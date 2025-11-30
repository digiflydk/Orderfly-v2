

'use server';

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Product, Category, ProductForMenu } from '@/types';

export async function getProductsForBrand(brandId: string): Promise<ProductForMenu[]> {
  if (!brandId) return [];
  const q = query(collection(db, 'products'), where('brandId', '==', brandId));
  const querySnapshot = await getDocs(q);
  const products = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()})) as Product[];
  // Sort in memory to avoid needing a composite index for sorting
  return products.sort((a,b) => (a.sortOrder || 999) - (b.sortOrder || 999));
}

export async function getCategoriesForBrand(brandId: string): Promise<Category[]> {
    if (!brandId) return [];
    
    const locationsQuery = query(collection(db, 'locations'), where('brandId', '==', brandId));
    const locationsSnapshot = await getDocs(locationsQuery);
    if (locationsSnapshot.empty) return [];
    const locationIds = locationsSnapshot.docs.map(doc => doc.id);

    // Firestore 'array-contains-any' is limited to 30 values in a single query.
    // If a brand has more than 30 locations, we need to batch the queries.
    const categoryPromises: Promise<any>[] = [];
    for (let i = 0; i < locationIds.length; i += 30) {
        const chunk = locationIds.slice(i, i + 30);
        const categoriesQuery = query(collection(db, 'categories'), where('locationIds', 'array-contains-any', chunk));
        categoryPromises.push(getDocs(categoriesQuery));
    }
    
    const categorySnapshots = await Promise.all(categoryPromises);
    const categories: Category[] = [];
    const categoryIds = new Set<string>();

    categorySnapshots.forEach(snapshot => {
        snapshot.forEach((doc: any) => {
            if (!categoryIds.has(doc.id)) {
                categories.push({ id: doc.id, ...doc.data() } as Category);
                categoryIds.add(doc.id);
            }
        });
    });

    return categories.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
}
