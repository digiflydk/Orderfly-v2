import 'server-only';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { readClubQrTouchInTransaction } from '@/lib/qr/touch';
import { hashKey } from './model';

// Server-only records contain QR provenance, never member/contact identity.
// The deterministic opaque key ties this to the single native member creation;
// it is not a browser identifier and is not exposed by any reporting endpoint.
export async function stageClubQrConversion(db: Firestore, tx: Transaction, input: {
  brandId: string; memberId: string; now: number;
  attribution?: { receipt: string; statisticsConsent: boolean };
}) {
  const noop = { apply() {} };
  if (input.attribution?.statisticsConsent !== true) return noop;
  const touch = await readClubQrTouchInTransaction(db, tx, {
    receipt: input.attribution.receipt, brandId: input.brandId, statisticsConsent: true, now: input.now,
  });
  if (!touch) return noop;
  const ref = db.collection('qrConversions').doc(hashKey('new_member', input.brandId, input.memberId));
  if ((await tx.get(ref)).exists) return noop;
  return { apply() {
    tx.create(ref, {
      schemaVersion: 1, conversionType: 'new_member', brandId: touch.brandId, locationId: touch.locationId,
      qrId: touch.qrId, qrRevision: touch.qrRevision, scanEventId: touch.scanEventId,
      occurredAt: touch.occurredAt, convertedAt: input.now, campaign: touch.campaign, tags: touch.tags,
      statisticsConsent: true,
    });
  } };
}
