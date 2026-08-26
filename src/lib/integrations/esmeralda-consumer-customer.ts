import 'server-only';

import { createHash } from 'node:crypto';

import { admin, getAdminDb } from '@/lib/firebase-admin';
import {
  esmeraldaConsumerCustomerSchema,
  normalizeEmail,
  normalizePhone,
  type EsmeraldaConsumerCustomerInput,
} from '@/lib/integrations/esmeralda-customer-contract';

export type ConsumerCustomerResolution = {
  customer_id: string;
  operation: 'created' | 'resolved' | 'updated';
  normalized_email: string;
  normalized_phone: string | null;
};

export class IntegrationConflictError extends Error {
  readonly code:
    | 'ambiguous_email_identity'
    | 'ambiguous_phone_identity'
    | 'phone_identity_conflict'
    | 'identity_index_conflict';

  constructor(
    code:
      | 'ambiguous_email_identity'
      | 'ambiguous_phone_identity'
      | 'phone_identity_conflict'
      | 'identity_index_conflict',
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationConflictError';
    this.code = code;
  }
}

export class IntegrationBoundaryError extends Error {
  readonly code:
    | 'organization_not_found'
    | 'location_not_found'
    | 'location_organization_mismatch';

  constructor(
    code:
      | 'organization_not_found'
      | 'location_not_found'
      | 'location_organization_mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationBoundaryError';
    this.code = code;
  }
}

type CustomerRecord = Record<string, unknown> & {
  brandId?: unknown;
  email?: unknown;
  normalizedEmail?: unknown;
  phone?: unknown;
  normalizedPhone?: unknown;
  fullName?: unknown;
};

type SelectedCustomer = {
  snapshot: FirebaseFirestore.QueryDocumentSnapshot;
  record: CustomerRecord;
};

function recordEmail(record: CustomerRecord): string | null {
  const candidate =
    typeof record.normalizedEmail === 'string'
      ? record.normalizedEmail
      : typeof record.email === 'string'
        ? record.email
        : null;

  return candidate ? normalizeEmail(candidate) : null;
}

function recordPhone(record: CustomerRecord): string | null {
  const candidate =
    typeof record.normalizedPhone === 'string'
      ? record.normalizedPhone
      : typeof record.phone === 'string'
        ? record.phone
        : null;

  return normalizePhone(candidate);
}

function identityKey(brandId: string, normalizedEmail: string): string {
  return createHash('sha256')
    .update(`${brandId}\n${normalizedEmail}`, 'utf8')
    .digest('hex');
}

function isPlaceholderName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'ikke oplyst' || normalized === 'not provided';
}

function buildExistingPatch(
  existing: CustomerRecord,
  parsed: EsmeraldaConsumerCustomerInput,
  normalizedEmail: string,
  normalizedPhone: string | null,
  now: FirebaseFirestore.FieldValue,
): { patch: Record<string, unknown>; wouldUpdate: boolean } {
  const patch: Record<string, unknown> = {
    email: normalizedEmail,
    normalizedEmail,
    locationIds: admin.firestore.FieldValue.arrayUnion(parsed.location_id),
    integrationSources: {
      esmeralda: {
        lastBookingId: parsed.booking_id,
        lastSyncedAt: now,
      },
    },
  };

  let wouldUpdate = recordEmail(existing) !== normalizedEmail;
  const incomingName = parsed.full_name.trim();
  const existingName = typeof existing.fullName === 'string' ? existing.fullName.trim() : '';

  if (incomingName && (!isPlaceholderName(incomingName) || !existingName)) {
    patch.fullName = incomingName;
    wouldUpdate ||= existingName !== incomingName;
  }

  const incomingPhone = parsed.phone?.trim() || '';
  if (incomingPhone && normalizedPhone) {
    patch.phone = incomingPhone;
    patch.normalizedPhone = normalizedPhone;
    wouldUpdate ||=
      recordPhone(existing) !== normalizedPhone || existing.phone !== incomingPhone;
  }

  if (typeof parsed.marketing_consent === 'boolean') {
    patch.marketingConsent = parsed.marketing_consent;
    wouldUpdate ||= existing.marketingConsent !== parsed.marketing_consent;
  }

  return { patch, wouldUpdate };
}

async function assertBrandAndLocationBoundary(
  organizationId: string,
  locationId: string,
): Promise<void> {
  const db = getAdminDb();
  const [brandSnapshot, locationSnapshot] = await Promise.all([
    db.collection('brands').doc(organizationId).get(),
    db.collection('locations').doc(locationId).get(),
  ]);

  if (!brandSnapshot.exists) {
    throw new IntegrationBoundaryError(
      'organization_not_found',
      'Mapped Orderfly brand does not exist.',
    );
  }

  if (!locationSnapshot.exists) {
    throw new IntegrationBoundaryError(
      'location_not_found',
      'Mapped Orderfly location does not exist.',
    );
  }

  const locationBrandId = locationSnapshot.get('brandId');
  if (locationBrandId !== organizationId) {
    throw new IntegrationBoundaryError(
      'location_organization_mismatch',
      'Mapped Orderfly location does not belong to the mapped brand.',
    );
  }
}

function selectExistingCustomer(
  customers: SelectedCustomer[],
  normalizedEmail: string,
  normalizedPhone: string | null,
): SelectedCustomer | null {
  const emailMatches = customers.filter(
    ({ record }) => recordEmail(record) === normalizedEmail,
  );

  if (emailMatches.length > 1) {
    throw new IntegrationConflictError(
      'ambiguous_email_identity',
      'More than one customer in the same brand has this normalized email.',
    );
  }

  if (emailMatches.length === 1) return emailMatches[0];
  if (!normalizedPhone) return null;

  const phoneMatches = customers.filter(
    ({ record }) => recordPhone(record) === normalizedPhone,
  );

  if (phoneMatches.length > 1) {
    throw new IntegrationConflictError(
      'ambiguous_phone_identity',
      'More than one customer in the same brand has this normalized phone.',
    );
  }

  if (phoneMatches.length === 0) return null;

  const matchedEmail = recordEmail(phoneMatches[0].record);
  if (matchedEmail && matchedEmail !== normalizedEmail) {
    throw new IntegrationConflictError(
      'phone_identity_conflict',
      'Phone matches an existing customer with a different email.',
    );
  }

  return phoneMatches[0];
}

export async function resolveOrUpsertEsmeraldaConsumerCustomer(
  input: EsmeraldaConsumerCustomerInput,
): Promise<ConsumerCustomerResolution> {
  const parsed = esmeraldaConsumerCustomerSchema.parse(input);
  const normalizedEmail = normalizeEmail(parsed.email);
  const normalizedPhone = normalizePhone(parsed.phone);

  await assertBrandAndLocationBoundary(
    parsed.organization_id,
    parsed.location_id,
  );

  const db = getAdminDb();
  const brandCustomers = await db
    .collection('customers')
    .where('brandId', '==', parsed.organization_id)
    .get();

  const customers: SelectedCustomer[] = brandCustomers.docs.map((snapshot) => ({
    snapshot,
    record: snapshot.data() as CustomerRecord,
  }));
  const selectedBeforeTransaction = selectExistingCustomer(
    customers,
    normalizedEmail,
    normalizedPhone,
  );

  const identityRef = db
    .collection('integrationConsumerCustomerIdentities')
    .doc(identityKey(parsed.organization_id, normalizedEmail));

  return db.runTransaction(async (transaction) => {
    const identitySnapshot = await transaction.get(identityRef);
    let customerRef: FirebaseFirestore.DocumentReference;
    let existing: CustomerRecord | null = null;
    let created = false;

    if (identitySnapshot.exists) {
      const indexedBrandId = identitySnapshot.get('brandId');
      const indexedCustomerId = identitySnapshot.get('customerId');
      if (
        indexedBrandId !== parsed.organization_id ||
        typeof indexedCustomerId !== 'string' ||
        !indexedCustomerId
      ) {
        throw new IntegrationConflictError(
          'identity_index_conflict',
          'Consumer customer identity reservation is inconsistent.',
        );
      }

      if (
        selectedBeforeTransaction &&
        selectedBeforeTransaction.snapshot.id !== indexedCustomerId
      ) {
        throw new IntegrationConflictError(
          'identity_index_conflict',
          'Consumer customer identity reservation conflicts with an existing customer.',
        );
      }

      customerRef = db.collection('customers').doc(indexedCustomerId);
      const customerSnapshot = await transaction.get(customerRef);
      if (!customerSnapshot.exists) {
        throw new IntegrationConflictError(
          'identity_index_conflict',
          'Consumer customer identity reservation points to a missing customer.',
        );
      }

      existing = customerSnapshot.data() as CustomerRecord;
      if (
        existing.brandId !== parsed.organization_id ||
        recordEmail(existing) !== normalizedEmail
      ) {
        throw new IntegrationConflictError(
          'identity_index_conflict',
          'Consumer customer identity reservation points outside the requested identity scope.',
        );
      }
    } else if (selectedBeforeTransaction) {
      customerRef = selectedBeforeTransaction.snapshot.ref;
      const customerSnapshot = await transaction.get(customerRef);
      if (!customerSnapshot.exists) {
        throw new IntegrationConflictError(
          'identity_index_conflict',
          'Selected consumer customer disappeared during identity resolution.',
        );
      }

      existing = customerSnapshot.data() as CustomerRecord;
      if (
        existing.brandId !== parsed.organization_id ||
        (recordEmail(existing) && recordEmail(existing) !== normalizedEmail)
      ) {
        throw new IntegrationConflictError(
          'identity_index_conflict',
          'Selected consumer customer changed identity scope during resolution.',
        );
      }
    } else {
      customerRef = db.collection('customers').doc();
      created = true;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    if (created) {
      const createData: Record<string, unknown> = {
        id: customerRef.id,
        brandId: parsed.organization_id,
        fullName: parsed.full_name,
        email: normalizedEmail,
        normalizedEmail,
        phone: parsed.phone?.trim() || '',
        normalizedPhone,
        status: 'active',
        createdAt: now,
        totalOrders: 0,
        totalSpend: 0,
        locationIds: [parsed.location_id],
        loyaltyScore: 0,
        loyaltyClassification: 'New',
        integrationSources: {
          esmeralda: {
            firstBookingId: parsed.booking_id,
            lastBookingId: parsed.booking_id,
            lastSyncedAt: now,
          },
        },
      };

      if (typeof parsed.marketing_consent === 'boolean') {
        createData.marketingConsent = parsed.marketing_consent;
      }

      transaction.set(customerRef, createData);
    } else {
      const { patch } = buildExistingPatch(
        existing!,
        parsed,
        normalizedEmail,
        normalizedPhone,
        now,
      );
      transaction.set(customerRef, patch, { merge: true });
    }

    transaction.set(
      identityRef,
      {
        brandId: parsed.organization_id,
        customerId: customerRef.id,
        emailHash: identityKey(parsed.organization_id, normalizedEmail),
        source: 'esmeralda',
        updatedAt: now,
        ...(identitySnapshot.exists ? {} : { createdAt: now }),
      },
      { merge: true },
    );

    const operation = created
      ? 'created'
      : buildExistingPatch(
            existing!,
            parsed,
            normalizedEmail,
            normalizedPhone,
            now,
          ).wouldUpdate
        ? 'updated'
        : 'resolved';

    return {
      customer_id: customerRef.id,
      operation,
      normalized_email: normalizedEmail,
      normalized_phone: normalizedPhone,
    };
  });
}
