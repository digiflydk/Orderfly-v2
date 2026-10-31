import {publicBrandRecord,publicLocationRecord} from '@/lib/public-native-records';
import {quoteContentDigest} from './digest';
import type {Brand,Location} from '@/types';
/** Same allow-listed projection for cached DTOs and fresh native records. */
export function restaurantFingerprint(brand:Brand,location:Location):string {
 return quoteContentDigest(JSON.parse(JSON.stringify({brand:publicBrandRecord(brand.id,brand as unknown as Record<string,unknown>),location:publicLocationRecord(location.id,location as unknown as Record<string,unknown>)})));
}
