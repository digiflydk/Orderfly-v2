import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { orderflyReadGrants, orderflySession } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { locationPaymentMethods, locationPaymentMethodsSchema, type LocationPaymentMethods } from '@/lib/merchant-payment-methods';
import type { Location } from '@/types';

export async function merchantPaymentLocations() {
  const db = getAdminDb();
  const [grants, editGrants] = await Promise.all([
    orderflyReadGrants('orderfly.catalog:view'), orderflyReadGrants('orderfly.catalog:edit').catch(() => []),
  ]);
  const rows = new Map<string, { id: string; brandId: string; name: string; editable: boolean; paymentMethods: LocationPaymentMethods }>();
  for (const grant of grants) {
    const docs = grant.locationIds === null
      ? (await db.collection('locations').where('brandId', '==', grant.brandId).get()).docs
      : await Promise.all(grant.locationIds.map(id => db.collection('locations').doc(id).get()));
    for (const doc of docs) {
      const location = doc.data();
      if (!doc.exists || location?.brandId !== grant.brandId) continue;
      rows.set(doc.id, { id: doc.id, brandId: grant.brandId, name: String(location.name || doc.id),
        editable: editGrants.some(edit => edit.brandId === grant.brandId && (edit.locationIds === null || edit.locationIds.includes(doc.id))),
        paymentMethods: locationPaymentMethods(location as Location) });
    }
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateMerchantPaymentMethods(locationId: string, value: unknown) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(locationId)) throw new Error('Ugyldig lokation.');
  const parsed = locationPaymentMethodsSchema.safeParse(value);
  if (!parsed.success) throw new Error('Vælg mindst én aktiv betalingsmetode.');
  const actor = await orderflySession(), db = getAdminDb(), ref = db.collection('locations').doc(locationId);
  await db.runTransaction(async tx => {
    const before = (await tx.get(ref)).data();
    if (!before) throw new Error('Lokationen findes ikke.');
    await authorizeTransaction(tx, actor.identity, { brandId: before.brandId, locationId }, 'orderfly.catalog:edit', 'location');
    if (!parsed.data.online && !before.deliveryTypes?.includes('pickup')) throw new Error('Lokationen skal tilbyde afhentning for kun at bruge betaling ved afhentning.');
    const now = getAdminFieldValue().serverTimestamp();
    tx.update(ref, { paymentMethods: parsed.data, updatedAt: now });
    tx.create(db.collection('auditLogs').doc(randomUUID()), {
      action: 'location_payment_methods_updated', brandId: before.brandId, locationId, actorId: actor.actorId,
      actorName: actor.name, before: locationPaymentMethods(before as Location), after: parsed.data, createdAt: now,
    });
  });
}
