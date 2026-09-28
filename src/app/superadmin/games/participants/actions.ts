'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { getAdminDb } from '@/lib/firebase-admin';
import { retryGameConsentJob } from '@/lib/games/worker';
import { marketingConfig } from '@/lib/marketing/config';

const identifier=/^[A-Za-z0-9_-]{1,128}$/;

export async function retryGameNewsletter(form:FormData):Promise<void>{
  await requirePlatformSuperuser();
  const brandId=String(form.get('brandId')||''),playId=String(form.get('playId')||'');
  if(!identifier.test(brandId)||!identifier.test(playId)||!marketingConfig(brandId))return;
  const db=getAdminDb(),play=await db.collection('gamePlays').doc(playId).get();
  if(!play.exists||play.data()?.brandId!==brandId||play.data()?.mode!=='live'||play.data()?.newsletter!==true)return;
  await retryGameConsentJob(db,brandId,playId);
  revalidatePath('/superadmin/games/participants');
}
