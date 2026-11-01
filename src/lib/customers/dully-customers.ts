import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizeEmail, normalizePhone } from '@/lib/integrations/esmeralda-customer-contract';
import {
  CustomerIdentityConflict, customerHasEmail, customerHasPhone, customerIdentityKey,
  mergeCustomerIdentity, selectCustomerByIdentity, type CustomerIdentityFields,
} from '@/lib/customer-identity';
import { DULLY_PURCHASE_RETENTION_MS, dullyPurchaseId, dullyPurchaseRowSchema, dullyPurchaseStats, type DullyPurchaseRow } from './dully-customer-contract';

// Server-only Dully customer/purchase import. The caller authorizes the session and supplies the
// configured Dully account/restaurant; this module enforces brand/location boundaries and identity rules.
export type DullyCustomerImportInput = { brandId: string; locationId: string; accountId: string; restaurantId: string; rows: unknown[]; now?: number };
export type DullyCustomerImportResult = { customersCreated: number; customersMatched: number; purchasesCreated: number; purchasesUpdated: number; purchasesUnchanged: number; conflicts: number };
type Row = CustomerIdentityFields & Record<string, any>;
const scopeSchema = z.object({ brandId: z.string().regex(/^[\w-]{1,160}$/), locationId: z.string().regex(/^[\w-]{1,160}$/), accountId: z.string().regex(/^[\w-]{1,120}$/), restaurantId: z.string().regex(/^[\w-]{1,120}$/) });
const MUTABLE = ['status', 'paymentStatus', 'completedAt', 'orderTotal', 'refundedAmount', 'orderLines', 'customerName', 'address'] as const;
const SAME_IDENTITY = ['externalOrderId', 'orderNumber', 'externalRestaurantId', 'orderedAt', 'experienceType'] as const;
const PLACEHOLDER = new Set(['', 'ikke oplyst', 'not provided']);

class Conflict extends Error { constructor(readonly code: string) { super(code); } }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function customerPatch(existing: Row, row: DullyPurchaseRow, email: string, now: number, purchaseId: string, linkIdentity: boolean) {
  const sources = existing.integrationSources && typeof existing.integrationSources === 'object' ? existing.integrationSources : {};
  const dully = sources.dully && typeof sources.dully === 'object' ? sources.dully : {};
  const patch: Record<string, unknown> = {
    ...(linkIdentity ? mergeCustomerIdentity(existing, email, row.phone) : {}),
    integrationSources: { ...sources, dully: {
      ...dully, firstImportedAt: dully.firstImportedAt || now, lastSyncedAt: now, lastPurchaseId: purchaseId,
      ...(row.externalCustomerId ? { externalCustomerIds: [...new Set([...(Array.isArray(dully.externalCustomerIds) ? dully.externalCustomerIds : []), row.externalCustomerId])] } : {}),
      // Evidence from Dully's subscriber list only. It does not set marketingConsent or enable any send.
      ...(row.marketingSubscriber === true ? { marketingSubscriber: true, marketingSubscriberSeenAt: now } : {}),
    } },
  };
  // Dully fills gaps; it never overwrites a name or address an Orderfly flow already holds.
  if (row.customerName && PLACEHOLDER.has(text(existing.fullName).toLowerCase())) patch.fullName = row.customerName;
  if (row.address && !text(existing.street)) Object.assign(patch, { street: row.address.street, zipCode: row.address.postalCode || '', city: row.address.city || '' });
  return patch;
}

export async function importDullyCustomerPurchases(input: DullyCustomerImportInput): Promise<DullyCustomerImportResult> {
  const s = scopeSchema.parse(input), now = input.now ?? Date.now();
  const rows = z.array(dullyPurchaseRowSchema).min(1).max(100).parse(input.rows);
  if (new Set(rows.map(r => r.externalOrderId)).size !== rows.length) throw new Error('Samme ordre står flere gange i importen.');
  if (rows.some(r => r.externalRestaurantId !== s.restaurantId || Date.parse(r.orderedAt) > now || (r.completedAt && Date.parse(r.completedAt) > now)))
    throw new Error('Ordren matcher ikke restauranten eller har en fremtidig dato.');
  const db = getAdminDb();
  const [brand, location] = await Promise.all([db.collection('brands').doc(s.brandId).get(), db.collection('locations').doc(s.locationId).get()]);
  if (!brand.exists || location.data()?.brandId !== s.brandId) throw new Error('Brand eller lokation findes ikke.');
  const known: Row[] = (await db.collection('customers').where('brandId', '==', s.brandId).get()).docs.map(d => ({ ...d.data(), id: d.id }));
  const result: DullyCustomerImportResult = { customersCreated: 0, customersMatched: 0, purchasesCreated: 0, purchasesUpdated: 0, purchasesUnchanged: 0, conflicts: 0 };

  // One transaction per order keeps identity reservations and stats consistent under concurrent imports.
  for (const row of rows) {
    const purchaseId = dullyPurchaseId(s.brandId, s.accountId, row.externalOrderId);
    const purchaseRef = db.collection('dullyCustomerPurchases').doc(purchaseId);
    const email = row.email ? normalizeEmail(row.email) : '', phone = normalizePhone(row.phone);
    try {
      const outcome = await db.runTransaction(async tx => {
        const old = (await tx.get(purchaseRef)).data();
        let customerRef: FirebaseFirestore.DocumentReference, existing: Row | null = null, created = false;
        const emailRef = email ? db.collection('integrationConsumerCustomerIdentities').doc(customerIdentityKey(s.brandId, email)) : null;
        const phoneRef = phone ? db.collection('integrationConsumerCustomerPhoneIdentities').doc(customerIdentityKey(s.brandId, phone)) : null;
        let reserved = { email: false, phone: false };
        if (old) {
          if (old.brandId !== s.brandId || SAME_IDENTITY.some(k => old[k] !== row[k])) throw new Error('Ordreidentiteten er ændret. Importen er afvist.');
          // An existing purchase stays with its customer; changed contact data never re-links or merges profiles.
          customerRef = db.collection('customers').doc(old.customerId);
        } else {
          const [emailSnap, phoneSnap] = await Promise.all([emailRef ? tx.get(emailRef) : null, phoneRef ? tx.get(phoneRef) : null]);
          reserved = { email: !!emailSnap?.exists, phone: !!phoneSnap?.exists };
          const indexed = [...new Set([emailSnap, phoneSnap].filter(x => x?.exists).map(x => {
            if (x!.get('brandId') !== s.brandId || typeof x!.get('customerId') !== 'string') throw new Conflict('identity_index_conflict');
            return x!.get('customerId') as string;
          }))];
          if (indexed.length > 1) throw new Conflict('customer_identity_conflict');
          let selected: Row | null;
          try { selected = selectCustomerByIdentity(known, email, phone); } catch (e) { throw e instanceof CustomerIdentityConflict ? new Conflict(e.code) : e; }
          if (selected && indexed[0] && selected.id !== indexed[0]) throw new Conflict('identity_index_conflict');
          const id = indexed[0] || (selected?.id as string | undefined);
          customerRef = id ? db.collection('customers').doc(id) : db.collection('customers').doc();
          created = !id;
        }
        if (!created) {
          const snapshot = await tx.get(customerRef);
          existing = snapshot.data() as Row | undefined || null;
          if (!existing || existing.brandId !== s.brandId) throw new Conflict('identity_index_conflict');
          if (!old && ((reserved.email && !customerHasEmail(existing, email)) || (reserved.phone && !customerHasPhone(existing, phone)) || (!customerHasEmail(existing, email) && !customerHasPhone(existing, phone))))
            throw new Conflict('identity_index_conflict');
        }
        const siblings = created ? [] : (await tx.get(db.collection('dullyCustomerPurchases').where('customerId', '==', customerRef.id))).docs.map(d => d.data())
          .filter(p => p.brandId === s.brandId && p.id !== purchaseId) as DullyPurchaseRow[];
        const mutable = Object.fromEntries(MUTABLE.filter(k => row[k] !== undefined).map(k => [k, row[k]]));
        const changed = !!old && MUTABLE.some(k => JSON.stringify(old[k]) !== JSON.stringify(row[k]));
        const purchase = { ...(old || {}), ...mutable, status: row.status, paymentStatus: row.paymentStatus, completedAt: row.completedAt };
        const stats = { ...dullyPurchaseStats([...siblings, { ...row, ...purchase } as DullyPurchaseRow]), updatedAt: now };

        if (old) {
          if (changed) tx.update(purchaseRef, { ...mutable, completedAt: row.completedAt, lastVerifiedAt: now, updatedAt: now });
          else tx.update(purchaseRef, { lastVerifiedAt: now });
        } else {
          const { email: _e, phone: _p, marketingSubscriber: _m, ...fields } = row;
          tx.create(purchaseRef, { ...fields, id: purchaseId, source: 'dully', brandId: s.brandId, locationId: s.locationId, accountId: s.accountId,
            customerId: customerRef.id, createdAt: now, updatedAt: now, lastVerifiedAt: now,
            // Deletion job (PR E) removes purchases three years after the order.
            retainUntil: Date.parse(row.orderedAt) + DULLY_PURCHASE_RETENTION_MS });
        }
        if (created) {
          tx.set(customerRef, { ...customerPatch({}, row, email, now, purchaseId, true), id: customerRef.id, brandId: s.brandId,
            fullName: row.customerName || 'Ikke oplyst', status: 'active', createdAt: new Date(now), totalOrders: 0, totalSpend: 0,
            locationIds: [s.locationId], loyaltyScore: 0, loyaltyClassification: 'New', externalPurchaseStats: { dully: stats } });
        } else {
          const patch = customerPatch(existing!, row, email, now, purchaseId, !old);
          const locationIds = Array.isArray(existing!.locationIds) ? existing!.locationIds : [];
          tx.set(customerRef, { ...patch, ...(locationIds.includes(s.locationId) ? {} : { locationIds: [...locationIds, s.locationId] }),
            externalPurchaseStats: { ...(existing!.externalPurchaseStats || {}), dully: stats } }, { merge: true });
        }
        if (!old) for (const [ref, field, value] of [[emailRef, 'emailHash', email], [phoneRef, 'phoneHash', phone]] as const) {
          if (ref && value) tx.set(ref, { brandId: s.brandId, customerId: customerRef.id, [field]: customerIdentityKey(s.brandId, value), source: 'dully', updatedAt: now }, { merge: true });
        }
        return { created, matched: !old && !created, purchase: old ? (changed ? 'updated' : 'unchanged') : 'created', id: customerRef.id };
      });
      if (outcome.created) { result.customersCreated++; known.push({ id: outcome.id, brandId: s.brandId, normalizedEmail: email, email, normalizedPhone: phone || undefined, phone: row.phone }); }
      if (outcome.matched) result.customersMatched++;
      if (outcome.purchase === 'created') result.purchasesCreated++; else if (outcome.purchase === 'updated') result.purchasesUpdated++; else result.purchasesUnchanged++;
    } catch (error) {
      if (!(error instanceof Conflict)) throw error;
      // Held for manual review. No contact data is stored, only the purchase reference and the reason.
      result.conflicts++;
      const ref = db.collection('dullyCustomerImportConflicts').doc(createHash('sha256').update(purchaseId).digest('hex'));
      await ref.set({ brandId: s.brandId, locationId: s.locationId, purchaseId, externalOrderId: row.externalOrderId, code: error.code, status: 'open', updatedAt: now }, { merge: true });
    }
  }
  return result;
}
