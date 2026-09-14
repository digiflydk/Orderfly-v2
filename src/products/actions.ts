'use server';

import { redirect } from 'next/navigation';
import { createOrUpdateProduct as saveProduct } from '@/app/superadmin/products/actions';
import { publicMenuProducts } from '@/lib/server/menu-products';
export { deleteProduct, updateProductSortOrder, getProducts, getProductById, getProductsByIds } from '@/app/superadmin/products/actions';
export type { ProductForMenu } from '@/types';
export type FormState = { message:string; error:boolean };

// Legacy routes use the same authenticated mutations and validation as mPanel.
export async function createOrUpdateProduct(_previous:FormState|null, form:FormData):Promise<FormState> {
  for (const flag of ['isActive','isFeatured','isNew','isPopular']) {
    if (!form.has(flag)) form.set(flag,'false');
  }
  const result = await saveProduct(null,form);
  if (!result?.ok) return {message:result?.error.message || 'Product could not be saved.',error:true};
  redirect('/superadmin/products');
}

export async function getProductsForLocation(locationId:string) {
  return publicMenuProducts(locationId);
}
