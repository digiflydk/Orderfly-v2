import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflyReadGrants } from './orderfly-session';

export async function nativeCatalog(permission: string) {
 const grants=await orderflyReadGrants(permission),db=getAdminDb();
 const brands:Array<{id:string;name:string;status:string}>=[],locations:Array<{id:string;name:string;brandId:string;isActive:boolean}>=[];
 for(const grant of grants){
  const brand=await db.collection('brands').doc(grant.brandId).get();
  if(!brand.exists)continue;
  brands.push({id:brand.id,name:String(brand.data()?.name||brand.id),status:String(brand.data()?.status||'')});
  const rows=grant.locationIds===null?(await db.collection('locations').where('brandId','==',grant.brandId).get()).docs:await Promise.all(grant.locationIds.map(id=>db.collection('locations').doc(id).get()));
  for(const row of rows)if(row.exists&&row.data()?.brandId===grant.brandId)locations.push({id:row.id,name:String(row.data()?.name||row.id),brandId:grant.brandId,isActive:row.data()?.isActive===true});
 }
 return {brands,locations};
}
