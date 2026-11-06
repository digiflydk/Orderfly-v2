'use server';
import { importGoogleReviews, importManualGoogleReviews } from '@/lib/feedback/google-import';
import { revalidatePath } from 'next/cache';
export async function runGoogleImport(brandId:string,locationId:string) {
  try { const result=await importGoogleReviews(brandId,locationId); revalidatePath('/superadmin/feedback/google'); return result; }
  catch { return {ok:false,message:'Importen kunne ikke startes. Kontrollér din adgang og lokationen.'}; }
}

export async function runManualImport(brandId:string,locationId:string,raw:string,publish:boolean){
 try {const result=await importManualGoogleReviews(brandId,locationId,raw,publish);revalidatePath('/superadmin/feedback/google');return result;}
 catch {return {ok:false,message:'Importen blev afvist. Kontrollér adgang, datoer, Google-links og højst 100 unikke femstjernede anmeldelser.'};}
}
