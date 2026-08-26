import 'server-only';

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
    | 'phone_identity_conflict';

  constructor(
    code:
      | 'ambiguous_email_identity'
      | 'ambiguous_phone_identity'
      | 'phone_identity_conflict',
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

  const customers = brandCustomers.docs.map((snapshot) => ({
    snapshot,
    record: snapshot.data() as CustomerRecord,
  }));

  const emailMatches = customers.filter(
    ({ record }) => recordEmail(record) === normalizedEmail,
  );

  if (emailMatches.length > 1) {
    throw new IntegrationConflictError(
      'ambiguous_email_identity',
      'More than one customer in the same brand has this normalized email.',
    );
  }

  let selected = emailMatches[0] ?? null;

  if (!selected && normalizedPhone) {
    const phoneMatches = customers.filter(
      ({ record }) => recordPhone(record) === normalizedPhone,
    );

    if (phoneMatches.length > 1) {
      throw new IntegrationConflictError(
        'ambiguous_phone_identity',
        'More than one customer in the same brand has this normalized phone.',
      );
    }

    if (phoneMatches.length === 1) {
      const matchedEmail = recordEmail(phoneMatches[0].record);
      if (matchedEmail && matchedEmail !== normalizedEmail) {
        throw new IntegrationConflictError(
          'phone_identity_conflict',
          'Phone matches an existing customer with a different email.',
        );
      }

      selected = phoneMatches[0];
    }
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  if (!selected) {
    const customerRef = db.collection('customers').doc();
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

    await customerRef.set(createData);

    return {
      customer_id: customerRef.id,
      operation: 'created',
      normalized_email: normalizedEmail,
      normalized_phone: normalizedPhone,
    };
  }

  const customerRef = selected.snapshot.ref;
  const existing = selected.record;
  const patch: Record<string, unknown> = {
    fullName: parsed.full_name,
    email: normalizedEmail,
    normalizedEmail,
    normalizedPhone,
    locationIds: admin.firestore.FieldValue.arrayUnion(parsed.location_id),
    integrationSources: {
      esmeralda: {
        lastBookingId: parsed.booking_id,
        lastSyncedAt: now,
      },
    },
  };

  if (parsed.phone?.trim()) {
    patch.phone = parsed.phone.trim();
  }

  if (typeof parsed.marketing_consent === 'boolean') {
    patch.marketingConsent = parsed.marketing_consent;
  }

  const wouldUpdate = Boolean(
    recordEmail(existing) !== normalizedEmail ||
      recordPhone(existing) !== normalizedPhone ||
      existing.fullName !== parsed.full_name ||
      (parsed.phone?.trim() && existing.phone !== parsed.phone.trim()),
  );

  await customerRef.set(patch, { merge: true });

  return {
    customer_id: customerRef.id,
    operation: wouldUpdate ? 'updated' : 'resolved',
    normalized_email: normalizedEmail,
    normalized_phone: normalizedPhone,
  };
}
