'use server';
import { revalidatePath } from 'next/cache';
import { getAdminDb, admin } from '@/lib/firebase-admin';
import { orderflyReadGrants, verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { principalKey } from '@/lib/access/authority';
import { scratchCardDraftSchema, type ScratchCardDraft } from '@/lib/games/scratch-card';

export async function gameBrands(): Promise<Array<{id:string; name:string}>> {
  const grants = await orderflyReadGrants('orderfly.website:view');
  const db = getAdminDb();
  const rows = await Promise.all(grants.filter(g => g.locationIds === null).map(async grant => {
    const doc = await db.collection('brands').doc(grant.brandId).get();
    return doc.exists ? {id:doc.id, name:String(doc.data()?.name || doc.id)} : null;
  }));
  return rows.filter((row): row is {id:string;name:string} => row !== null).sort((a,b)=>a.name.localeCompare(b.name,'da'));
}

export async function getScratchCardDraft(brandId: string): Promise<ScratchCardDraft | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(brandId)) return null;
  const grants = await orderflyReadGrants('orderfly.website:view');
  if (!grants.some(g => g.brandId === brandId && g.locationIds === null)) return null;
  const doc = await getAdminDb().collection('gameScratchDrafts').doc(brandId).get();
  if (!doc.exists) return null;
  const parsed = scratchCardDraftSchema.safeParse(doc.data());
  return parsed.success ? parsed.data : null;
}

export async function saveScratchCardDraft(form: FormData): Promise<{ok:boolean;message:string}> {
  const parsed = scratchCardDraftSchema.safeParse({
    brandId: form.get('brandId'), title: form.get('title'),
    instruction: form.get('instruction'), revealText: form.get('revealText'),
    placement: form.get('placement'),
    paths: String(form.get('paths') || '').split(/\r?\n/).map(p=>p.trim()).filter(Boolean),
  });
  if (!parsed.success) return {ok:false,message:parsed.error.issues.map(i=>i.message).join(' ')};
  const input = parsed.data;
  try {
    const identity = await verifiedOrderflyIdentity();
    const db = getAdminDb(), ref = db.collection('gameScratchDrafts').doc(input.brandId);
    await db.runTransaction(async tx => {
      const before = await tx.get(ref);
      await authorizeTransaction(tx, identity, {brandId:input.brandId}, `orderfly.website:${before.exists ? 'edit' : 'create'}`, 'company');
      tx.set(ref, { ...input, status:'draft', updatedAt:admin.firestore.FieldValue.serverTimestamp() });
      tx.set(db.collection('auditLogs').doc(), {
        module:'games', entity:'scratch-card', entityId:input.brandId,
        action:before.exists ? 'update' : 'create', brandId:input.brandId,
        actorId:principalKey(identity), path:ref.path,
        timestamp:admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    revalidatePath('/superadmin/games/scratch-card');
    return {ok:true,message:'Udkast gemt. Spillet er kun synligt i administrator-preview.'};
  } catch {
    return {ok:false,message:'Udkastet kunne ikke gemmes. Kontrollér dine rettigheder og prøv igen.'};
  }
}
