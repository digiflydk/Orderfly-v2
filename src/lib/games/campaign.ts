import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { scratchCardDraftSchema, type ScratchCardDraft } from './scratch-card';
export { campaignStatus, overlaps } from './schedule';
import { campaignStatus } from './schedule';
export async function brandCampaigns(db:Firestore,brandId:string) {
  const rows=await db.collection('gameScratchDrafts').where('brandId','==',brandId).get();
  return rows.docs.filter(doc=>scratchCardDraftSchema.safeParse(doc.data()).success);
}
export async function liveCampaign(db:Firestore,brandId:string):Promise<QueryDocumentSnapshot|null> {
  const rows=await brandCampaigns(db,brandId);
  return rows.find(doc=>campaignStatus(doc.data().status,doc.data() as ScratchCardDraft)==='live')||null;
}
