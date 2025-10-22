

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, setDoc, deleteDoc, getDocs, query, orderBy, writeBatch, where, documentId } from 'firebase/firestore';
import type { Product } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';

const productSchema = z.object({
  id: z.string().optional().nullable(),
  brandId: z.string().min(1, 'A brand must be selected.'),
  locationIds: z.array(z.string()).optional().default([]),
  categoryId: z.string().min(1, 'A category must be selected.'),
  productName: z.string().min(2, 'Product name must be at least 2 characters.'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'Price must be a non-negative number.'),
  priceDelivery: z.coerce.number().min(0, 'Delivery price must be a non-negative number.').optional(),
  isActive: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  isNew: z.boolean().default(false),
  isPopular: z.boolean().default(false),
  allergenIds: z.array(z.string()).optional().default([]),
  toppingGroupIds: z.array(z.string()).optional().default([]),
  imageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
});

export type FormState = {
  message: string;
  error: boolean;
};

export async function createOrUpdateProduct(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
    
  const id = formData.get('id') as string | null;
  
  const rawData: Record<string, any> = Object.fromEntries(formData);
  
  rawData.id = id;
  rawData.locationIds = formData.getAll('locationIds');
  rawData.allergenIds = formData.getAll('allergenIds');
  rawData.toppingGroupIds = formData.getAll('toppingGroupIds');
  
  // Correctly read boolean values from form data
  rawData.isActive = formData.get('isActive') === 'on';
  rawData.isFeatured = formData.get('isFeatured') === 'on';
  rawData.isNew = formData.get('isNew') === 'on';
  rawData.isPopular = formData.get('isPopular') === 'on';

  if (typeof rawData.price === 'string') {
    rawData.price = rawData.price.replace(',', '.');
  }
  if (typeof rawData.priceDelivery === 'string' && rawData.priceDelivery) {
    rawData.priceDelivery = rawData.priceDelivery.replace(',', '.');
  } else if (!rawData.priceDelivery) {
    delete rawData.priceDelivery;
  }
  
  // Enforce single badge rule server-side
  if (rawData.isFeatured) {
      rawData.isNew = false;
      rawData.isPopular = false;
  } else if (rawData.isNew) {
      rawData.isFeatured = false;
      rawData.isPopular = false;
  } else if (rawData.isPopular) {
      rawData.isFeatured = false;
      rawData.isNew = false;
  }

  const validatedFields = productSchema.safeParse(rawData);

  if (!validatedFields.success) {
    console.error(validatedFields.error.flatten());
    const errorMessages = Object.entries(validatedFields.error.flatten().fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
    return {
      message: `Validation failed: ${errorMessages}`,
      error: true,
    };
  }

  const { id: validatedId, ...productData } = validatedFields.data;
  let finalProductData: Partial<Product> = productData;

  try {
    const productRef = validatedId ? doc(db, 'products', validatedId) : doc(collection(db, 'products'));
    const finalId = productRef.id;

    if (!validatedId) {
        const productsCountQuery = query(collection(db, 'products'), where('brandId', '==', productData.brandId));
        const countSnapshot = await getDocs(productsCountQuery);
        finalProductData.sortOrder = countSnapshot.size;
    }

    const dataToSave = { ...finalProductData, id: finalId };
    await setDoc(productRef, dataToSave, { merge: true });

  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save product: ${errorMessage}`, error: true };
  }
  
  revalidatePath(`/superadmin/products`);
  redirect(`/superadmin/products`);
}

export async function deleteProduct(productId: string) {
    try {
        await deleteDoc(doc(db, "products", productId));
        revalidatePath("/superadmin/products");
        return { message: "Product deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete product: ${errorMessage}`, error: true };
    }
}

export async function updateProductSortOrder(orderedProducts: {id: string, sortOrder: number}[]) {
    try {
        const batch = writeBatch(db);
        orderedProducts.forEach(product => {
            const docRef = doc(db, 'products', product.id);
            batch.update(docRef, { sortOrder: product.sortOrder });
        });
        await batch.commit();
        revalidatePath('/superadmin/products');
        return { message: 'Product order updated.', error: false };
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to update product order: ${errorMessage}`, error: true };
    }
}

// New lightweight product type for menu display
export type ProductForMenu = Pick<Product, 
    'id' | 'productName' | 'description' | 'price' | 'priceDelivery' | 
    'imageUrl' | 'isFeatured' | 'isNew' | 'isPopular' | 'allergenIds' | 
    'toppingGroupIds' | 'categoryId' | 'brandId' | 'sortOrder'
>;

export async function getProductsForLocation(locationId: string): Promise<ProductForMenu[]> {
    if (!locationId) return [];

    const q = query(
        collection(db, 'products'),
        where('isActive', '==', true)
    );
    const querySnapshot = await getDocs(q);

    const allProducts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));

    const locationProducts = allProducts.filter(p => {
        // If a product has no specific locations assigned, it is available at all locations for the brand.
        // Otherwise, it must be explicitly assigned to the current location.
        return !p.locationIds || p.locationIds.length === 0 || p.locationIds.includes(locationId);
    });

    const sortedProducts = locationProducts.sort((a,b) => (a.sortOrder || 999) - (b.sortOrder || 999));

    // Map to the lightweight type *before* returning
    const finalProducts = sortedProducts.map(p => ({
        id: p.id,
        productName: p.productName,
        description: p.description,
        price: p.price,
        priceDelivery: p.priceDelivery,
        imageUrl: p.imageUrl,
        isFeatured: p.isFeatured,
        isNew: p.isNew,
        isPopular: p.isPopular,
        allergenIds: p.allergenIds,
        toppingGroupIds: p.toppingGroupIds,
        categoryId: p.categoryId,
        brandId: p.brandId,
        sortOrder: p.sortOrder,
    }));
    
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[DEBUG] getProductsForLocation:',
        finalProducts.map((p) => ({
          id: p.id,
          productName: p.productName,
          price: p.price,
          toppingGroups: p.toppingGroupIds?.length,
          imageSize: p.imageUrl?.length,
          fullSize: JSON.stringify(p).length
        }))
      );
    }
    
    return finalProducts;
}


export async function getProducts(brandId?: string): Promise<Product[]> {
    let q;
    if (brandId) {
        q = query(collection(db, 'products'), where('brandId', '==', brandId), orderBy('sortOrder', 'asc'));
    } else {
        q = query(collection(db, 'products'), orderBy('sortOrder', 'asc'));
    }
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[];
}

export async function getProductById(productId: string): Promise<Product | null> {
    const docRef = doc(db, 'products', productId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Product;
    }
    return null;
}

export async function getProductsByIds(productIds: string[], brandId?: string): Promise<ProductForMenu[]> {
    if (!productIds || productIds.length === 0) return [];
    
    // Firestore 'in' queries are limited to 30 items in the array.
    const productPromises: Promise<Product[]>[] = [];
    for (let i = 0; i < productIds.length; i += 30) {
        const chunk = productIds.slice(i, i + 30);
        let q = query(collection(db, 'products'), where(documentId(), 'in', chunk));
        if (brandId) {
            q = query(q, where('brandId', '==', brandId));
        }
        const p = getDocs(q).then(snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
        productPromises.push(p);
    }
    
    const productArrays = await Promise.all(productPromises);
    const allProducts = productArrays.flat();

    // Map to the lightweight type
    const finalProducts = allProducts.map(p => ({
        id: p.id,
        productName: p.productName,
        description: p.description,
        price: p.price,
        priceDelivery: p.priceDelivery,
        imageUrl: p.imageUrl,
        isFeatured: p.isFeatured,
        isNew: p.isNew,
        isPopular: p.isPopular,
        allergenIds: p.allergenIds,
        toppingGroupIds: p.toppingGroupIds,
        categoryId: p.categoryId,
        brandId: p.brandId,
        sortOrder: p.sortOrder,
    }));
    
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[DEBUG] getProductsByIds:',
        finalProducts.map((p) => ({
          id: p.id,
          productName: p.productName,
          price: p.price,
          toppingGroups: p.toppingGroupIds?.length,
          imageSize: p.imageUrl?.length,
          fullSize: JSON.stringify(p).length
        }))
      );
    }
    
    return finalProducts;
}

export async function duplicateProducts({
  productIds,
  targetBrandId,
  targetLocationIds,
}: {
  productIds: string[];
  targetBrandId: string;
  targetLocationIds: string[];
}): Promise<{ success: boolean; message: string }> {
  if (!productIds || productIds.length === 0) {
    return { success: false, message: 'No products selected for duplication.' };
  }
  if (!targetBrandId) {
    return { success: false, message: 'Target brand must be selected.' };
  }

  try {
    const productsToDuplicate: Product[] = [];
    // Firestore 'in' query is limited to 30 items, so we might need to batch this
    for (let i = 0; i < productIds.length; i += 30) {
      const chunk = productIds.slice(i, i + 30);
      const q = query(collection(db, 'products'), where(documentId(), 'in', chunk));
      const snapshot = await getDocs(q);
      snapshot.forEach(doc => {
        productsToDuplicate.push({ id: doc.id, ...doc.data() } as Product);
      });
    }

    if (productsToDuplicate.length === 0) {
      return { success: false, message: 'Could not find the selected products to duplicate.' };
    }

    const batch = writeBatch(db);
    let duplicatedCount = 0;

    for (const product of productsToDuplicate) {
      const newProductId = doc(collection(db, 'products')).id;
      const { id, ...originalData } = product; // Exclude original ID
      
      const newProductData = {
        ...originalData,
        id: newProductId,
        brandId: targetBrandId,
        locationIds: targetLocationIds,
        productName: product.productName, // Do not add "(Copy)"
        sortOrder: 9999, // Place duplicated items at the end
      };
      
      batch.set(doc(db, 'products', newProductId), newProductData);
      duplicatedCount++;
    }

    await batch.commit();
    revalidatePath('/superadmin/products');
    return { success: true, message: `${duplicatedCount} products duplicated successfully.` };
  } catch (e: any) {
    console.error('Failed to duplicate products:', e);
    return { success: false, message: `An error occurred: ${e.message}` };
  }
}
