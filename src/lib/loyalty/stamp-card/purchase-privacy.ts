import 'server-only';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { COLLECTIONS } from './model';

const BATCH_SIZE = 150;

// Prepare before any writes in membership deletion. Only purchase links are
// removed; amounts, immutable audit facts and replay keys remain intact.
export async function preparePurchaseLinkCleanup(db: Firestore, tx: Transaction, brandId: string, memberId: string, remainingWrites = BATCH_SIZE) {
  const limit = Math.min(BATCH_SIZE, Math.max(0, remainingWrites));
  if (limit === 0) return { pending: true, apply: () => {} };
  const rows = await tx.get(db.collection(COLLECTIONS.events).where('memberId', '==', memberId).where('brandId', '==', brandId)
    .where('purchaseLinksPresent', '==', true).limit(limit));
  const owned = rows.docs.filter(doc => doc.data().brandId === brandId);
  return { pending: owned.length === limit, apply: () => {
    for (const doc of owned) {
      const { customerId: _customerId, orderId: _orderId, orderNumber: _orderNumber, ...audit } = doc.data();
      tx.set(doc.ref, { ...audit, purchaseLinksPresent: false });
    }
  } };
}

// Durable continuation for large histories or an interrupted deletion request.
// A tombstone keeps no customer identity and remains pending until all batches
// have committed. The normal counter/settlement writers reject deleted members.
export async function runPurchaseLinkCleanup(db: Firestore) {
  const members = await db.collection(COLLECTIONS.members).where('purchaseEventCleanupPending', '==', true).limit(20).get();
  let processed = 0;
  for (const doc of members.docs) {
    await db.runTransaction(async tx => {
      const member = (await tx.get(doc.ref)).data();
      if (!member || member.status !== 'deleted' || member.purchaseEventCleanupPending !== true || typeof member.brandId !== 'string') return;
      const cleanup = await preparePurchaseLinkCleanup(db, tx, member.brandId, doc.id);
      cleanup.apply();
      tx.update(doc.ref, { purchaseEventCleanupPending: cleanup.pending });
    });
    processed++;
  }
  return { processed };
}
