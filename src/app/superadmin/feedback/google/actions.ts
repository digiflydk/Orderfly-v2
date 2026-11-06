'use server';
import { importGoogleReviews } from '@/lib/feedback/google-import';
import { revalidatePath } from 'next/cache';
export async function runGoogleImport(brandId:string,locationId:string) {
  try { const result=await importGoogleReviews(brandId,locationId); revalidatePath('/superadmin/feedback/google'); return result; }
  catch { return {ok:false,message:'Importen kunne ikke startes. Kontrollér din adgang og lokationen.'}; }
}
