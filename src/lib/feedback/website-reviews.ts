import 'server-only';
import {getAdminDb} from '@/lib/firebase-admin';
import {readPublicReviews} from './public-reviews';
import type {GoogleReview} from './google-client';
export async function esmeraldaWebsiteReviews(){
 const db=getAdminDb();
 const brands=await db.collection('brands').where('slug','==','esmeralda').limit(2).get();
 if(brands.docs.length!==1)return [];
 const brand=brands.docs[0];
 const locations=await db.collection('locations').where('brandId','==',brand.id).where('slug','==','amager').limit(2).get();
 if(locations.docs.length!==1)return [];
 const location=locations.docs[0];
 const first=await readPublicReviews(brand.id,location.id);if(!first)return [];
 let page=first;
 const own=[...page.reviews];
 for(let i=0;page.next && i<49;i++){const next=await readPublicReviews(brand.id,location.id,page.next);if(!next)break;page=next;own.push(...page.reviews);}
 const result=own.filter(r=>r.rating===5).map(r=>({...r,id:'feedback:'+r.id,source:'esmeralda',photoUrl:null as string|null,reviewUrl:null as string|null,dateApproximate:false}));
 // Explicit activation after source permissions/retention are verified; import alone never publishes.
 const data=(await db.collection('googleFeedbackImports').doc(location.id).get()).data();
 if(process.env.GOOGLE_FEEDBACK_PUBLIC_ENABLED!=='true' && data?.showPublicly!==true)return result;
 if(data?.brandId!==brand.id || data?.expiresAt?.toMillis()<=Date.now() || !data?.expiresAt)return result;
 for(const r of (data.reviews||[]) as GoogleReview[]){
  if(r.starRating!=='FIVE')continue;
  result.push({id:'google:'+r.reviewId,displayName:r.reviewer.isAnonymous?'Anonym Google-bruger':r.reviewer.displayName||'Google-bruger',comment:r.comment||'',rating:5,receivedAt:r.createTime,source:'google',reviewUrl:r.reviewUrl||null,dateApproximate:r.dateApproximate===true,photoUrl:r.reviewer.isAnonymous?null:r.reviewer.profilePhotoUrl||null});
 }
 return result;
}
