

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
import { getLoyaltySettings } from '../loyalty/actions';


const customerSchema = z.object({
  id: z.string().optional(),
  fullName: z.string().min(2, { message: 'Full name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  phone: z.string().min(1, { message: 'Phone number is required.' }),
  status: z.preprocess((val) => val === 'on' || val === true, z.boolean()),
});

export type FormState = {
  message: string;
  error: boolean;
};

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
        email: z.string().email(),
        phone: z.string().min(1, 'Phone is required'),
        status: z.enum(['active', 'inactive']),
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
          if (before) return { ...before, ...customerData };
          return { ...customerData, id: docId, brandId, createdAt: Timestamp.now(), totalOrders: 0, totalSpend: 0, locationIds: [], loyaltyScore: 0, loyaltyClassification: 'New' };
        });

        return { message: `Customer ${id ? 'updated' : 'created'} successfully.`, error: false };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to save customer: ${errorMessage}`, error: true };
    }
}

export async function deleteCustomer(customerId: string) {
    try {
        await mutateScopedDocument('customers', customerId, 'orderfly.customers:delete', 'company', () => null);
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
    }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Sort in-memory
        
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
