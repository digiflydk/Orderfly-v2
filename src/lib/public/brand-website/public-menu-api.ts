'use server';

import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';
import { getAdminDb } from '@/lib/firebase-admin';

interface BrandMenuProductDocument {
  title?: string;
  description?: string;
  price?: number;
  categoryId?: string;
  sortOrder?: number;
  isActive?: boolean;
}

interface BrandMenuCategoryDocument {
  name?: string;
  sortOrder?: number;
}

interface PublicMenuProduct {
  id: string;
  title?: string;
  description?: string;
  price?: number;
  categoryId?: string;
  sortOrder?: number;
}

interface PublicMenuCategory {
  id: string;
  title?: string;
  sortOrder?: number;
}

interface PublicBrandMenuData {
  categories: PublicMenuCategory[];
  products: PublicMenuProduct[];
}

export async function getPublicBrandMenuData(
  brandId: string,
): Promise<PublicBrandMenuData> {
  const start = Date.now();

  try {
    const db = getAdminDb();

    const categoriesSnap = await db
      .collection('brands')
      .doc(brandId)
      .collection('categories')
      .get();

    const productsSnap = await db
      .collection('brands')
      .doc(brandId)
      .collection('menus')
      .get();

    const activeProducts = productsSnap.docs
      .map((document) => {
        const data = document.data() as BrandMenuProductDocument;

        return {
          id: document.id,
          ...data,
        };
      })
      .filter((product) => product.isActive === true)
      .map(
        (product): PublicMenuProduct => ({
          id: product.id,
          title: product.title,
          description: product.description,
          price: product.price,
          categoryId: product.categoryId,
          sortOrder: product.sortOrder,
        }),
      )
      .sort(
        (first, second) =>
          (first.sortOrder ?? 999) - (second.sortOrder ?? 999),
      );

    const activeCategoryIds = new Set(
      activeProducts
        .map((product) => product.categoryId)
        .filter((categoryId): categoryId is string => Boolean(categoryId)),
    );

    const categories = categoriesSnap.docs
      .map((document) => {
        const data = document.data() as BrandMenuCategoryDocument;

        return {
          id: document.id,
          ...data,
        };
      })
      .filter((category) => activeCategoryIds.has(category.id))
      .map(
        (category): PublicMenuCategory => ({
          id: category.id,
          title: category.name,
          sortOrder: category.sortOrder,
        }),
      )
      .sort(
        (first, second) =>
          (first.sortOrder ?? 999) - (second.sortOrder ?? 999),
      );

    await logBrandWebsiteApiCall({
      layer: 'public',
      action: 'getPublicBrandMenuData',
      brandId,
      status: 'success',
      durationMs: Date.now() - start,
      path: `/brands/${brandId}`,
    });

    return {
      categories,
      products: activeProducts,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    await logBrandWebsiteApiCall({
      layer: 'public',
      action: 'getPublicBrandMenuData',
      brandId,
      status: 'error',
      durationMs: Date.now() - start,
      path: `/brands/${brandId}`,
      errorMessage,
    });

    return {
      categories: [],
      products: [],
    };
  }
}
