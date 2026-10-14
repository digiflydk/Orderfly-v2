import 'server-only';

import { admin, getAdminDb } from '@/lib/firebase-admin';
import {
  esmeraldaConsumerCustomerSchema,
  normalizeEmail,
  normalizePhone,
  type EsmeraldaConsumerCustomerInput,
} from '@/lib/integrations/esmeralda-customer-contract';
import {
  CustomerIdentityConflict,
  customerIdentityKey,
  customerHasEmail,
  customerHasPhone,
  mergeCustomerIdentity,
  selectCustomerByIdentity,
  type CustomerIdentityFields,
} from '@/lib/customer-identity';

export type ConsumerCustomerResolution = {
  customer_id: string;
  operation: 'created' | 'resolved' | 'updated';
  normalized_email: string | null;
  normalized_phone: string | null;
};

export class IntegrationConflictError extends Error {
  readonly code:
    | 'ambiguous_email_identity'
    | 'ambiguous_phone_identity'
    | 'customer_identity_conflict'
    | 'identity_index_conflict';

  constructor(
    code:
      | 'ambiguous_email_identity'
      | 'ambiguous_phone_identity'
      | 'customer_identity_conflict'
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
  emailAliases?: unknown;
  phoneAliases?: unknown;
  fullName?: unknown;
  integrationSources?: unknown;
};

type SelectedCustomer = CustomerIdentityFields & {
  snapshot: FirebaseFirestore.QueryDocumentSnapshot;
  record: CustomerRecord;
};

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
  const currentSources = existing.integrationSources && typeof existing.integrationSources === 'object'
    ? existing.integrationSources as Record<string, unknown>
    : {};
  const currentEsmeraldaSource = currentSources.esmeralda && typeof currentSources.esmeralda === 'object'
    ? currentSources.esmeralda as Record<string, unknown>
    : {};
  const patch: Record<string, unknown> = {
    ...mergeCustomerIdentity(existing, normalizedEmail, parsed.phone),
    locationIds: admin.firestore.FieldValue.arrayUnion(parsed.location_id),
    integrationSources: {
      ...currentSources,
      esmeralda: {
        ...currentEsmeraldaSource,
        lastBookingId: parsed.booking_id,
        lastSyncedAt: now,
      },
    },
  };

  let wouldUpdate = Boolean(normalizedEmail && !customerHasEmail(existing, normalizedEmail));
  const incomingName = parsed.full_name.trim();
  const existingName = typeof existing.fullName === 'string' ? existing.fullName.trim() : '';

  if (incomingName && (!isPlaceholderName(incomingName) || !existingName)) {
    patch.fullName = incomingName;
    wouldUpdate ||= existingName !== incomingName;
  }

  if (parsed.phone?.trim() && normalizedPhone) {
    wouldUpdate ||= !customerHasPhone(existing, normalizedPhone);
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
  try {
    return selectCustomerByIdentity(
      customers,
      normalizedEmail,
      normalizedPhone,
      customer => customer.snapshot.id,
    );
  } catch (error) {
    if (error instanceof CustomerIdentityConflict) {
      throw new IntegrationConflictError(error.code, error.message);
    }
    throw error;
  }
}

export async function resolveOrUpsertEsmeraldaConsumerCustomer(
  input: EsmeraldaConsumerCustomerInput,
): Promise<ConsumerCustomerResolution> {
  const parsed = esmeraldaConsumerCustomerSchema.parse(input);
  const normalizedEmail = parsed.email ? normalizeEmail(parsed.email) : '';
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

  const customers: SelectedCustomer[] = brandCustomers.docs.map((snapshot) => {
    const record = snapshot.data() as CustomerRecord;
    return { ...record, id: snapshot.id, snapshot, record };
  });
  const selectedBeforeTransaction = selectExistingCustomer(
    customers,
    normalizedEmail,
    normalizedPhone,
  );

  const emailIdentityRef = normalizedEmail
    ? db.collection('integrationConsumerCustomerIdentities')
        .doc(customerIdentityKey(parsed.organization_id, normalizedEmail))
    : null;
  const phoneIdentityRef = normalizedPhone
    ? db.collection('integrationConsumerCustomerPhoneIdentities')
        .doc(customerIdentityKey(parsed.organization_id, normalizedPhone))
    : null;

  return db.runTransaction(async (transaction) => {
    const [emailIdentitySnapshot, phoneIdentitySnapshot] = await Promise.all([
      emailIdentityRef ? transaction.get(emailIdentityRef) : Promise.resolve(null),
      phoneIdentityRef ? transaction.get(phoneIdentityRef) : Promise.resolve(null),
    ]);
    const indexedCustomerIds = [emailIdentitySnapshot, phoneIdentitySnapshot]
      .filter((snapshot): snapshot is FirebaseFirestore.DocumentSnapshot => !!snapshot?.exists)
      .map((snapshot) => {
        const indexedBrandId = snapshot.get('brandId');
        const indexedCustomerId = snapshot.get('customerId');
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
        return indexedCustomerId;
      });
    const uniqueIndexedIds = [...new Set(indexedCustomerIds)];
    if (uniqueIndexedIds.length > 1) {
      throw new IntegrationConflictError(
        'customer_identity_conflict',
        'Email and phone identity reservations point to different customers.',
      );
    }
    const indexedCustomerId = uniqueIndexedIds[0] || null;
    if (
      selectedBeforeTransaction &&
      indexedCustomerId &&
      selectedBeforeTransaction.snapshot.id !== indexedCustomerId
    ) {
      throw new IntegrationConflictError(
        'identity_index_conflict',
        'Consumer customer identity reservation conflicts with an existing customer.',
      );
    }

    let customerRef: FirebaseFirestore.DocumentReference;
    let existing: CustomerRecord | null = null;
    let created = false;
    if (indexedCustomerId) {
      customerRef = db.collection('customers').doc(indexedCustomerId);
    } else if (selectedBeforeTransaction) {
      customerRef = selectedBeforeTransaction.snapshot.ref;
    } else {
      customerRef = db.collection('customers').doc();
      created = true;
    }

    if (!created) {
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
        (!customerHasEmail(existing, normalizedEmail) &&
          !customerHasPhone(existing, normalizedPhone))
      ) {
        throw new IntegrationConflictError(
          'identity_index_conflict',
          'Selected consumer customer changed identity scope during resolution.',
        );
      }
      if (
        emailIdentitySnapshot?.exists &&
        !customerHasEmail(existing, normalizedEmail)
      ) {
        throw new IntegrationConflictError(
          'identity_index_conflict',
          'Email identity reservation does not match the customer profile.',
        );
      }
      if (
        phoneIdentitySnapshot?.exists &&
        !customerHasPhone(existing, normalizedPhone)
      ) {
        throw new IntegrationConflictError(
          'identity_index_conflict',
          'Phone identity reservation does not match the customer profile.',
        );
      }
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    if (created) {
      const createData: Record<string, unknown> = {
        id: customerRef.id,
        brandId: parsed.organization_id,
        fullName: parsed.full_name,
        ...mergeCustomerIdentity({}, normalizedEmail, parsed.phone),
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

    if (emailIdentityRef) {
      transaction.set(
        emailIdentityRef,
        {
          brandId: parsed.organization_id,
          customerId: customerRef.id,
          emailHash: customerIdentityKey(parsed.organization_id, normalizedEmail),
          source: 'esmeralda',
          updatedAt: now,
          ...(emailIdentitySnapshot?.exists ? {} : { createdAt: now }),
        },
        { merge: true },
      );
    }
    if (phoneIdentityRef) {
      transaction.set(
        phoneIdentityRef,
        {
          brandId: parsed.organization_id,
          customerId: customerRef.id,
          phoneHash: customerIdentityKey(parsed.organization_id, normalizedPhone!),
          source: 'esmeralda',
          updatedAt: now,
          ...(phoneIdentitySnapshot?.exists ? {} : { createdAt: now }),
        },
        { merge: true },
      );
    }

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
      normalized_email: normalizedEmail || null,
      normalized_phone: normalizedPhone,
    };
  });
}
