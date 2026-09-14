 'use server';
import { listScopedDocuments } from '@/lib/access/scoped-data';
import { listLocationCatalog } from '@/lib/access/location-catalog';
import { upsellClientData } from '@/lib/upsell-serialization';
import type { Category, ProductForMenu } from '@/types';

export async function getProductsForBrand(brandId:string):Promise<ProductForMenu[]> {
 const rows=await listScopedDocuments('products','orderfly.catalog:view','locations',[['brandId','==',brandId]]);
 return upsellClientData(rows.map(doc=>({...doc.data(),id:doc.id})).sort((a:any,b:any)=>(a.sortOrder||999)-(b.sortOrder||999))) as ProductForMenu[];
}
export async function getCategoriesForBrand(brandId:string):Promise<Category[]> {
 return (await listLocationCatalog('categories',brandId)).sort((a,b)=>String(a.categoryName).localeCompare(String(b.categoryName))) as Category[];
}
