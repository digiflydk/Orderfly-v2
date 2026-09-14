import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflyReadGrants, orderflySession } from './orderfly-session';

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

// Selector metadata may span several permitted features, but each native scope
// is evaluated independently. Session-wide permission names are not scopes.
export async function selectorCatalog() {
 const session=await orderflySession();
 if(session.superuser)return {superuser:true as const,brands:[],locations:[]};
 const results=await Promise.all(session.permissions.filter(p=>p.endsWith(':view')&&(p.startsWith('orderfly.')||p==='platform.companies:view'||p==='platform.locations:view')).map(async permission=>{
  try{return await nativeCatalog(permission);}catch(error){if((error as {status?:number}).status===403)return {brands:[],locations:[]};throw error;}
 }));
 return {superuser:false as const,brands:[...new Map(results.flatMap(r=>r.brands).map(r=>[r.id,r])).values()],locations:[...new Map(results.flatMap(r=>r.locations).map(r=>[r.id,r])).values()]};
}
