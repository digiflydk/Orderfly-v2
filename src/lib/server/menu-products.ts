import 'server-only';
import { z } from 'zod';
import { FieldPath } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Product, ProductForMenu } from '@/types';

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export function menuProduct(product: Product): ProductForMenu {
  const {id,productName,description,price,priceDelivery,imageUrl,isFeatured,isNew,isPopular,allergenIds,toppingGroupIds,toppingGroupConditions,categoryId,brandId,sortOrder} = product;
  return {id,productName,description,price,priceDelivery,imageUrl,isFeatured,isNew,isPopular,allergenIds,toppingGroupIds,toppingGroupConditions,categoryId,brandId,sortOrder};
}

export async function publicMenuProducts(locationId: string, productIds?: string[], brandId?: string): Promise<ProductForMenu[]> {
  identifier.parse(locationId);
  if (brandId !== undefined) identifier.parse(brandId);
  const ids = productIds === undefined ? null : [...new Set(z.array(identifier).max(500).parse(productIds))];
  const db = getAdminDb(), location = await db.collection('locations').doc(locationId).get();
  const tenant = location.data()?.brandId;
  if (!location.exists || location.data()?.isActive !== true || !identifier.safeParse(tenant).success || (brandId && tenant !== brandId)) return [];
  const brand = await db.collection('brands').doc(tenant).get();
  if (!brand.exists || brand.data()?.status === 'suspended') return [];
  const chunks = ids === null ? [null] : Array.from({length:Math.ceil(ids.length/30)},(_,i)=>ids.slice(i*30,i*30+30));
  const products: Product[] = [];
  for (const chunk of chunks) {
    let query = db.collection('products').where('brandId','==',tenant).where('isActive','==',true);
    if (chunk) query = query.where(FieldPath.documentId(),'in',chunk);
    const result = await query.get();
    for (const doc of result.docs) {
      const value = doc.data();
      if (value.isTestData === true || (value.locationIds?.length && !value.locationIds.includes(locationId))) continue;
      products.push({...value,id:doc.id} as Product);
    }
  }
  return products.sort((a,b)=>(a.sortOrder ?? 999)-(b.sortOrder ?? 999)).map(menuProduct);
}
