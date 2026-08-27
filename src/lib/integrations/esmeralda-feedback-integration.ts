import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { admin, getAdminDb } from '@/lib/firebase-admin';
import {
  esmeraldaBookingFeedbackInvitationSchema,
  esmeraldaCustomerHistorySchema,
  type EsmeraldaBookingFeedbackInvitationInput,
  type EsmeraldaCustomerHistoryInput,
} from '@/lib/integrations/esmeralda-feedback-contract';
import { IntegrationBoundaryError } from '@/lib/integrations/esmeralda-consumer-customer';

const INVITATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type InvitationTokenPayload = {
  v: 1;
  source_type: 'booking';
  organization_id: string;
  location_id: string;
  booking_id: string;
  customer_id: string;
  exp: number;
};

export type BookingFeedbackInvitation = {
  invitation_id: string;
  source_type: 'booking';
  organization_id: string;
  location_id: string;
  booking_id: string;
  customer_id: string;
  full_name: string;
  email: string;
  starts_at: string | null;
  expires_at: string;
  status: 'active' | 'submitted' | 'revoked';
  feedback_id: string | null;
};

function integrationSecret(): string {
  const secret = process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET ?? '';
  if (secret.length < 32) {
    throw new Error('ORDERFLY_ESMERALDA_INTEGRATION_SECRET is not configured.');
  }
  return secret;
}

function invitationId(organizationId: string, bookingId: string): string {
  return createHash('sha256')
    .update(`${organizationId}\nbooking\n${bookingId}`, 'utf8')
    .digest('hex');
}

function signature(payload: string): string {
  return createHmac('sha256', integrationSecret())
    .update(payload, 'utf8')
    .digest('base64url');
}

function signInvitation(payload: InvitationTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${signature(encoded)}`;
}

function parseInvitationToken(token: string): InvitationTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, suppliedSignature] = parts;
  if (!encoded || !suppliedSignature) return null;

  const expected = Buffer.from(signature(encoded));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<InvitationTokenPayload>;
    if (
      parsed.v !== 1 ||
      parsed.source_type !== 'booking' ||
      typeof parsed.organization_id !== 'string' ||
      typeof parsed.location_id !== 'string' ||
      typeof parsed.booking_id !== 'string' ||
      typeof parsed.customer_id !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (parsed.exp <= Date.now()) return null;
    return parsed as InvitationTokenPayload;
  } catch {
    return null;
  }
}

function toDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function toIso(value: unknown): string | null {
  return toDate(value)?.toISOString() ?? null;
}

async function assertBrandLocationAndCustomer(
  organizationId: string,
  locationId: string,
  customerId: string,
): Promise<{ brand: FirebaseFirestore.DocumentSnapshot; customer: FirebaseFirestore.DocumentSnapshot }> {
  const db = getAdminDb();
  const [brand, location, customer] = await Promise.all([
    db.collection('brands').doc(organizationId).get(),
    db.collection('locations').doc(locationId).get(),
    db.collection('customers').doc(customerId).get(),
  ]);

  if (!brand.exists) {
    throw new IntegrationBoundaryError('organization_not_found', 'Mapped Orderfly brand does not exist.');
  }
  if (!location.exists) {
    throw new IntegrationBoundaryError('location_not_found', 'Mapped Orderfly location does not exist.');
  }
  if (location.get('brandId') !== organizationId) {
    throw new IntegrationBoundaryError('location_organization_mismatch', 'Mapped Orderfly location does not belong to the mapped brand.');
  }
  if (!customer.exists || customer.get('brandId') !== organizationId) {
    throw new IntegrationBoundaryError('organization_not_found', 'Mapped consumer customer does not exist in the requested brand.');
  }

  return { brand, customer };
}

export async function createBookingFeedbackInvitation(
  input: EsmeraldaBookingFeedbackInvitationInput,
): Promise<{ invitation: BookingFeedbackInvitation; token: string }> {
  const parsed = esmeraldaBookingFeedbackInvitationSchema.parse(input);
  await assertBrandLocationAndCustomer(parsed.organization_id, parsed.location_id, parsed.customer_id);

  const db = getAdminDb();
  const id = invitationId(parsed.organization_id, parsed.booking_id);
  const ref = db.collection('integrationFeedbackInvitations').doc(id);
  const now = Date.now();

  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      const data = snapshot.data() ?? {};
      if (
        data.organizationId !== parsed.organization_id ||
        data.locationId !== parsed.location_id ||
        data.bookingId !== parsed.booking_id ||
        data.customerId !== parsed.customer_id
      ) {
        throw new Error('Existing booking feedback invitation has an integration scope mismatch.');
      }

      return { data, created: false };
    }

    const expiresAt = admin.firestore.Timestamp.fromMillis(now + INVITATION_TTL_MS);
    const data = {
      sourceType: 'booking',
      organizationId: parsed.organization_id,
      locationId: parsed.location_id,
      bookingId: parsed.booking_id,
      customerId: parsed.customer_id,
      fullName: parsed.full_name.trim(),
      email: parsed.email.trim().toLowerCase(),
      startsAt: parsed.starts_at ?? null,
      status: 'active',
      feedbackId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
    };
    transaction.create(ref, data);
    return { data, created: true };
  });

  const expiresAtDate = toDate(result.data.expiresAt) ?? new Date(now + INVITATION_TTL_MS);
  const payload: InvitationTokenPayload = {
    v: 1,
    source_type: 'booking',
    organization_id: parsed.organization_id,
    location_id: parsed.location_id,
    booking_id: parsed.booking_id,
    customer_id: parsed.customer_id,
    exp: expiresAtDate.getTime(),
  };

  return {
    token: signInvitation(payload),
    invitation: {
      invitation_id: id,
      source_type: 'booking',
      organization_id: parsed.organization_id,
      location_id: parsed.location_id,
      booking_id: parsed.booking_id,
      customer_id: parsed.customer_id,
      full_name: String(result.data.fullName ?? parsed.full_name),
      email: String(result.data.email ?? parsed.email).toLowerCase(),
      starts_at: typeof result.data.startsAt === 'string' ? result.data.startsAt : parsed.starts_at ?? null,
      expires_at: expiresAtDate.toISOString(),
      status: result.data.status === 'submitted' || result.data.status === 'revoked' ? result.data.status : 'active',
      feedback_id: typeof result.data.feedbackId === 'string' ? result.data.feedbackId : null,
    },
  };
}

export async function resolveBookingFeedbackInvitationToken(
  token: string,
): Promise<BookingFeedbackInvitation | null> {
  const payload = parseInvitationToken(token);
  if (!payload) return null;

  const db = getAdminDb();
  const id = invitationId(payload.organization_id, payload.booking_id);
  const snapshot = await db.collection('integrationFeedbackInvitations').doc(id).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() ?? {};

  if (
    data.sourceType !== 'booking' ||
    data.organizationId !== payload.organization_id ||
    data.locationId !== payload.location_id ||
    data.bookingId !== payload.booking_id ||
    data.customerId !== payload.customer_id
  ) {
    return null;
  }

  const expiresAt = toDate(data.expiresAt);
  if (!expiresAt || expiresAt.getTime() <= Date.now() || data.status === 'revoked') return null;

  return {
    invitation_id: id,
    source_type: 'booking',
    organization_id: payload.organization_id,
    location_id: payload.location_id,
    booking_id: payload.booking_id,
    customer_id: payload.customer_id,
    full_name: typeof data.fullName === 'string' ? data.fullName : 'Guest',
    email: typeof data.email === 'string' ? data.email : '',
    starts_at: typeof data.startsAt === 'string' ? data.startsAt : null,
    expires_at: expiresAt.toISOString(),
    status: data.status === 'submitted' ? 'submitted' : 'active',
    feedback_id: typeof data.feedbackId === 'string' ? data.feedbackId : null,
  };
}

export async function getEsmeraldaConsumerCustomerHistory(
  input: EsmeraldaCustomerHistoryInput,
) {
  const parsed = esmeraldaCustomerHistorySchema.parse(input);
  const db = getAdminDb();
  const customerRef = db.collection('customers').doc(parsed.customer_id);
  const customerSnapshot = await customerRef.get();
  if (!customerSnapshot.exists || customerSnapshot.get('brandId') !== parsed.organization_id) {
    throw new IntegrationBoundaryError('organization_not_found', 'Consumer customer does not exist in the requested brand.');
  }

  const [ordersSnapshot, feedbackSnapshot] = await Promise.all([
    db.collection('orders')
      .where('brandId', '==', parsed.organization_id)
      .where('customerDetails.id', '==', parsed.customer_id)
      .get(),
    db.collection('feedback')
      .where('brandId', '==', parsed.organization_id)
      .where('customerId', '==', parsed.customer_id)
      .get(),
  ]);

  const orders = ordersSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      source_type: 'commerce_order' as const,
      created_at: toIso(data.createdAt),
      location_id: typeof data.locationId === 'string' ? data.locationId : null,
      location_name: typeof data.locationName === 'string' ? data.locationName : null,
      delivery_type: typeof data.deliveryType === 'string' ? data.deliveryType : null,
      status: typeof data.status === 'string' ? data.status : null,
      payment_status: typeof data.paymentStatus === 'string' ? data.paymentStatus : null,
      total_amount: typeof data.totalAmount === 'number' ? data.totalAmount : 0,
    };
  }).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, parsed.limit);

  const feedback = feedbackSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    const sourceType = data.sourceType === 'booking' ? 'booking' : 'commerce_order';
    const sourceId = typeof data.sourceId === 'string'
      ? data.sourceId
      : typeof data.orderId === 'string'
        ? data.orderId
        : null;
    return {
      id: snapshot.id,
      source_type: sourceType,
      source_id: sourceId,
      received_at: toIso(data.receivedAt),
      rating: typeof data.rating === 'number' ? data.rating : 0,
      nps_score: typeof data.npsScore === 'number' ? data.npsScore : null,
      comment: typeof data.comment === 'string' ? data.comment : null,
      tags: Array.isArray(data.tags) ? data.tags.filter((value): value is string => typeof value === 'string') : [],
    };
  }).sort((a, b) => (b.received_at ?? '').localeCompare(a.received_at ?? '')).slice(0, parsed.limit);

  const customer = customerSnapshot.data() ?? {};
  return {
    customer: {
      customer_id: customerSnapshot.id,
      organization_id: parsed.organization_id,
      full_name: typeof customer.fullName === 'string' ? customer.fullName : '',
      email: typeof customer.email === 'string' ? customer.email : '',
      phone: typeof customer.phone === 'string' ? customer.phone : '',
      status: typeof customer.status === 'string' ? customer.status : 'active',
      total_orders: typeof customer.totalOrders === 'number' ? customer.totalOrders : 0,
      total_spend: typeof customer.totalSpend === 'number' ? customer.totalSpend : 0,
      last_order_at: toIso(customer.lastOrderDate),
      loyalty_score: typeof customer.loyaltyScore === 'number' ? customer.loyaltyScore : 0,
      loyalty_classification: typeof customer.loyaltyClassification === 'string' ? customer.loyaltyClassification : '',
    },
    commerce_orders: orders,
    feedback,
  };
}
