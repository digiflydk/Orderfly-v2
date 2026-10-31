import 'server-only';
import {unstable_cache,revalidateTag} from 'next/cache';
import {getAdminDb} from '@/lib/firebase-admin';
import {publicBrandRecord,publicLocationRecord} from '@/lib/public-native-records';
// Cache only public restaurant DTOs, never a customer, draft, binding or approval.
// All native admin writers already invalidate storefront after committing.
const read=async(brandId:string,locationId:string)=>{
 const db=getAdminDb();
 const [brand,location]=await Promise.all([db.collection('brands').doc(brandId).get(),db.collection('locations').doc(locationId).get()]);
 return {brand:brand.exists?publicBrandRecord(brandId,brand.data()!):null,location:location.exists?publicLocationRecord(locationId,location.data()!):null};
};
// Dispatch/payment workers import the final validators but do not use this cache.
let cached:typeof read|undefined;
export async function loadQuoteRestaurant(brandId:string,locationId:string){
 const load=cached??=unstable_cache(read,['delivery-restaurant-v1'],{revalidate:60,tags:['storefront']});
 return structuredClone(await load(brandId,locationId));
}
export function invalidateQuoteRestaurant(){revalidateTag('storefront');}
