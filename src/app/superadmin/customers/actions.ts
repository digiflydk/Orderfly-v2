

'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { orderflyReadGrants, requireOrderflyAccess } from '@/lib/access/orderfly-session';
import { getScopedDocument, listScopedDocuments, mutateScopedDocument } from '@/lib/access/scoped-data';
import { Timestamp } from 'firebase-admin/firestore';
import type { Customer, OrderDetail, Feedback } from '@/types';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { customerMetrics,asDate,qualifyingOrders } from '@/lib/loyalty/model';
import { customerFeedbackHistory } from '@/lib/feedback/customer-history';
import { customerIdentityKey } from '@/lib/customer-identity';
import { normalizeEmail, normalizePhone } from '@/lib/integrations/esmeralda-customer-contract';
import { getLoyaltySettings } from '../loyalty/actions';


export type FormState = {
  message: string;
  error: boolean;
};

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mergeDirectoryIdentity(before: Record<string, unknown> | null, emailInput: string, phoneInput: string) {
  const email = emailInput.trim();
  const phone = phoneInput.trim();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone) || '';
  const previousEmails = [
    ...stringValues(before?.normalizedEmail),
    ...stringValues(before?.email),
    ...stringValues(before?.emailAliases),
  ].map(normalizeEmail).filter(Boolean);
  const previousPhones = [
    ...stringValues(before?.normalizedPhone),
    ...stringValues(before?.phone),
    ...stringValues(before?.phoneAliases),
  ].map(value => normalizePhone(value)).filter((value): value is string => !!value);

  return {
    email,
    normalizedEmail,
    emailAliases: [...new Set([...previousEmails, ...(normalizedEmail ? [normalizedEmail] : [])])]
      .filter(value => value !== normalizedEmail),
    phone,
    normalizedPhone,
    phoneAliases: [...new Set([...previousPhones, ...(normalizedPhone ? [normalizedPhone] : [])])]
      .filter(value => value !== normalizedPhone),
  };
}

function identityReservations(record: Record<string, unknown>, brandId: string) {
  const emails = [...new Set([
    ...stringValues(record.normalizedEmail),
    ...stringValues(record.email),
    ...stringValues(record.emailAliases),
  ].map(normalizeEmail).filter(Boolean))];
  const phones = [...new Set([
    ...stringValues(record.normalizedPhone),
    ...stringValues(record.phone),
    ...stringValues(record.phoneAliases),
  ].map(value => normalizePhone(value)).filter((value): value is string => !!value))];
  return [
    ...emails.map(identity => ({
      collection: 'integrationConsumerCustomerIdentities',
      hashField: 'emailHash',
      identity,
      key: customerIdentityKey(brandId, identity),
    })),
    ...phones.map(identity => ({
      collection: 'integrationConsumerCustomerPhoneIdentities',
      hashField: 'phoneHash',
      identity,
      key: customerIdentityKey(brandId, identity),
    })),
  ];
}

async function reserveCustomerIdentities(
  tx: FirebaseFirestore.Transaction,
  customerId: string,
  record: Record<string, unknown>,
): Promise<void> {
  const brandId = typeof record.brandId === 'string' ? record.brandId : '';
  if (!brandId) throw new Error('Customer brand is required for identity reservation.');
  const db = getAdminDb();
  const entries = identityReservations(record, brandId);
  const refs = entries.map(entry => db.collection(entry.collection).doc(entry.key));
  const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
  for (const snapshot of snapshots) {
    if (snapshot.exists && (snapshot.get('brandId') !== brandId || snapshot.get('customerId') !== customerId)) {
      throw new Error('This email or phone is already assigned to another customer in this brand.');
    }
  }
  const now = Timestamp.now();
  entries.forEach((entry, index) => {
    const existing = snapshots[index]?.data();
    tx.set(refs[index], {
      brandId,
      customerId,
      [entry.hashField]: entry.key,
      source: typeof existing?.source === 'string' ? existing.source : 'orderfly_admin',
      updatedAt: now,
      ...(existing?.createdAt ? {} : { createdAt: now }),
    }, { merge: true });
  });
}

async function removeCustomerIdentityReservations(
  tx: FirebaseFirestore.Transaction,
  customerId: string,
  record: Record<string, unknown>,
): Promise<void> {
  const brandId = typeof record.brandId === 'string' ? record.brandId : '';
  if (!brandId) return;
  const db = getAdminDb();
  const entries = identityReservations(record, brandId);
  const refs = entries.map(entry => db.collection(entry.collection).doc(entry.key));
  const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
  snapshots.forEach((snapshot, index) => {
    if (snapshot.exists && snapshot.get('brandId') === brandId && snapshot.get('customerId') === customerId) {
      tx.delete(refs[index]);
    }
  });
}

export async function getCustomerFormBrands(): Promise<Array<{id:string;name:string}>> {
  const grants = await orderflyReadGrants('orderfly.customers:create');
  const documents = await Promise.all(grants.filter(grant=>grant.locationIds===null)
    .map(grant=>getAdminDb().collection('brands').doc(grant.brandId).get()));
  return documents.filter(doc=>doc.exists).map(doc=>({id:doc.id,name:String(doc.data()?.name || doc.id)}));
}

export async function createOrUpdateCustomer(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
    const rawData = {
        id: formData.get('id') || undefined,
        fullName: formData.get('fullName'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        status: formData.get('status') === 'active',
    };
    
    const mappedData = {
        ...rawData,
        status: formData.get('status') === 'active' ? 'active' : 'inactive',
    };

    const validationSchema = z.object({
        id: z.string().optional(),
        fullName: z.string().min(2, 'Name is required'),
        email: z.string().trim().refine(value => !value || z.string().email().safeParse(value).success, 'Please enter a valid email.'),
        phone: z.string().trim().refine(value => !value || /\d/.test(value), 'Please enter a valid phone number.'),
        status: z.enum(['active', 'inactive']),
    }).superRefine((value, context) => {
      if (!value.email && !value.phone) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'A valid email or phone number is required.',
      });
    });

    const validatedFields = validationSchema.safeParse(mappedData);

    if (!validatedFields.success) {
        console.error(validatedFields.error.flatten());
        const errorMessages = Object.entries(validatedFields.error.flatten().fieldErrors)
            .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
            .join('; ');
        return { message: 'Validation failed: ' + errorMessages, error: true };
    }

    const { id, ...customerData } = validatedFields.data;
    const docId = id || getAdminDb().collection('customers').doc().id;

    try {
        const brandId = id ? null : z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).parse(formData.get('brandId'));
        if (brandId) await requireOrderflyAccess(brandId, null, 'orderfly.customers:create');
        await mutateScopedDocument('customers', docId, `orderfly.customers:${id ? 'edit' : 'create'}`, 'company', before => {
          const identity = mergeDirectoryIdentity(before, customerData.email, customerData.phone);
          if (before) return { ...before, ...customerData, ...identity };
          return { ...customerData, ...identity, id: docId, brandId, createdAt: Timestamp.now(), totalOrders: 0, totalSpend: 0, locationIds: [], loyaltyScore: 0, loyaltyClassification: 'New' };
        }, false, async (_before, after, tx) => {
          if (after) await reserveCustomerIdentities(tx, docId, after);
        });

        return { message: `Customer ${id ? 'updated' : 'created'} successfully.`, error: false };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to save customer: ${errorMessage}`, error: true };
    }
}

export async function deleteCustomer(customerId: string) {
    try {
        await mutateScopedDocument('customers', customerId, 'orderfly.customers:delete', 'company', () => null, false, async (before, _after, tx) => {
          if (before) await removeCustomerIdentityReservations(tx, customerId, before);
        });
        revalidatePath("/superadmin/customers");
        return { message: "Customer deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete customer: ${errorMessage}`, error: true };
    }
}


export async function getCustomers(): Promise<Customer[]> {
  const customerDocs = await listScopedDocuments('customers', 'orderfly.customers:view', 'company');
  const brandIds = [...new Set(customerDocs.map(d => d.data().brandId))];
  const [ordersByBrand, loyaltySettings] = await Promise.all([
    Promise.all(brandIds.map(brandId => getAdminDb().collection('orders').where('brandId', '==', brandId).get())),
    getLoyaltySettings(),
  ]);
  const customerSnapshot = { docs: customerDocs };
  const ordersSnapshot = { docs: ordersByBrand.flatMap(result => result.docs) };

  const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrderDetail));
  const ordersByCustomerId = allOrders.reduce((acc, order) => {
      const customerId = order.customerDetails?.id;
      if (!customerId) return acc;
      if (!acc[customerId]) {
          acc[customerId] = [];
      }
      acc[customerId].push(order);
      return acc;
  }, Object.create(null) as Record<string, OrderDetail[]>);

  const customers = customerSnapshot.docs.map(doc => {
      const data = doc.data() as Omit<Customer, 'id' | 'createdAt' | 'lastOrderDate'> & { createdAt: Timestamp, lastOrderDate?: Timestamp, cookie_consent?: any };
      const customerOrders = ordersByCustomerId[doc.id] || [];

      // Convert all timestamps to serializable format
      const customerForCalc: Customer = {
          ...data,
          id: doc.id,
          createdAt: asDate(data.createdAt) || new Date(0),
          lastOrderDate: asDate(data.lastOrderDate) || undefined,
          cookie_consent: data.cookie_consent ? {
            ...data.cookie_consent,
            timestamp: asDate(data.cookie_consent.timestamp) || new Date(0),
          } : undefined,
      } as Customer;
      
      const metrics = customerMetrics(customerOrders.filter(o=>o.brandId===customerForCalc.brandId), loyaltySettings);
      return { 
          ...customerForCalc,
          ...metrics,
      } as Customer;
  });

  return customers.sort((a, b) => (asDate(b.lastOrderDate)?.getTime() ?? -Infinity) - (asDate(a.lastOrderDate)?.getTime() ?? -Infinity) || a.id.localeCompare(b.id));
}


export async function getCustomerDetails(customerId: string): Promise<{ 
    customer: Customer; 
    allOrders: OrderDetail[];
    deliveryOrdersCount: number;
    pickupOrdersCount: number;
    retentionRate: number;
    loyaltyScore: number;
    loyaltyClassification: string;
    averageFeedbackRating: number;
    orderIdsWithFeedback: string[];
    feedbackEntries: NonNullable<Awaited<ReturnType<typeof customerFeedbackHistory>>>;
    feedbackAccess: boolean;
} | null> {
    const decodedCustomerId = decodeURIComponent(customerId);
    const customerSnap = await getScopedDocument('customers', decodedCustomerId, 'orderfly.customers:view', 'company');

    if (!customerSnap) {
        return null;
    }

    const customerData = customerSnap.data()!;
    // Convert timestamps before creating the final customer object
    const finalCustomerData: any = {
      ...customerData,
      id: customerSnap.id,
      createdAt: asDate(customerData.createdAt) || new Date(0),
      lastOrderDate: asDate(customerData.lastOrderDate) || undefined,
      cookie_consent: customerData.cookie_consent ? {
        ...customerData.cookie_consent,
        timestamp: asDate(customerData.cookie_consent.timestamp) || new Date(0),
      } : undefined,
    };


    const customer: Customer = finalCustomerData as Customer;

    const ordersSnapshot = await getAdminDb().collection('orders')
      .where('customerDetails.id', '==', decodedCustomerId).where('brandId', '==', customer.brandId).get();
    const sourceOrders = ordersSnapshot.docs.map(snapshot => snapshot.data() as OrderDetail);
    const allOrders = ordersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            createdAt: asDate(data.createdAt) || new Date(0),
        } as OrderDetail;
    }).sort((a, b) => (asDate(b.paidAt)?.getTime() ?? -Infinity) - (asDate(a.paidAt)?.getTime() ?? -Infinity)); // Sort by payment date only.
        
    const paidOrders = qualifyingOrders(allOrders);
    const deliveryOrdersCount = paidOrders.filter(o => o.deliveryType === 'Delivery').length;
    const pickupOrdersCount = paidOrders.filter(o => o.deliveryType === 'Pickup').length;
    
    // Simplified retention rate
    
    const loyaltySettings = await getLoyaltySettings();
    const metrics = customerMetrics(sourceOrders.filter(o=>o.brandId===customer.brandId), loyaltySettings);
    const retentionRate = metrics.totalOrders > 1 ? 100 : 0;
    const history = await customerFeedbackHistory(customer.brandId, decodedCustomerId);
    const feedbackEntries = history || [];
    const ratings = feedbackEntries.flatMap(f => f.rating === null ? [] : [f.rating]);
    const averageFeedbackRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const orderIdsWithFeedback = feedbackEntries.flatMap(f => f.orderId ? [f.orderId] : []);

    return {
        customer: {...customer,...metrics},
        allOrders,
        deliveryOrdersCount,
        pickupOrdersCount,
        retentionRate,
        loyaltyScore: metrics.loyaltyScore,
        loyaltyClassification: metrics.loyaltyClassification,
        averageFeedbackRating,
        orderIdsWithFeedback,
        feedbackEntries,
        feedbackAccess: history !== null,
    };
}
