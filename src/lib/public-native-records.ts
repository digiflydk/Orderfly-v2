import type { Brand, Location } from '@/types';
import { brandRecord } from './brand-record';

const brandFields = ['name','slug','companyName','status','street','zipCode','city','country','currency','companyRegNo','foodCategories','locationsCount','logoUrl','supportEmail','website','termsUrl','privacyUrl','cookiesUrl','offersHeading','combosHeading','bagFee','adminFee','adminFeeType','vatPercentage','appearances','ga4MeasurementId','gtmContainerId','googleAdsConversionId','googleAdsPurchaseLabel','metaPixelId'] as const;
const locationFields = ['name','slug','brandId','address','street','zipCode','city','country','isActive','openingHours','deliveryFee','minOrder','deliveryTypes','imageUrl','smileyUrl','allowPreOrder','prep_time','delivery_time','travlhed_factor','manual_override','pickupSaveTag'] as const;
function project(data:Record<string,unknown>,keys:readonly string[]) {
 return Object.fromEntries(keys.filter(key=>Object.hasOwn(data,key)).map(key=>[key,data[key]]));
}
// Public storefront DTOs never inherit owner identities, plan bindings or
// arbitrary native/integration fields added to the stored documents later.
export function publicBrandRecord(id:string,data:Record<string,unknown>):Brand {
 return brandRecord(id,{...project(data,brandFields),ownerId:''});
}
export function publicLocationRecord(id:string,data:Record<string,unknown>):Location {
 return {...project(data,locationFields),id} as Location;
}
