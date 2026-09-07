

'use server';

import { db } from '@/lib/firebase';
import { collection, getDocs, query, Timestamp, doc, setDoc, updateDoc, deleteDoc, getDoc, where } from 'firebase/firestore';
import type { Customer, OrderDetail, Feedback } from '@/types';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { customerMetrics,asDate,qualifyingOrders } from '@/lib/loyalty/model';
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


export async function createOrUpdateCustomer(
  prevState: FormState,
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
    const docId = id || doc(collection(db, 'customers')).id;

    try {
        const customerRef = doc(db, 'customers', docId);
        
        if (id) {
             await updateDoc(customerRef, customerData);
        } else {
            const brandId = z.string().min(1).max(150).refine(value => !value.includes('/')).parse(formData.get('brandId'));
            if (!(await getDoc(doc(db, 'brands', brandId))).exists()) throw new Error('Select an existing brand.');
            const newCustomerData = {
                ...customerData,
                id: docId,
                brandId,
                createdAt: Timestamp.now(),
                totalOrders: 0,
                totalSpend: 0,
                locationIds: [],
                loyaltyScore: 0,
                loyaltyClassification: 'New',
            }
            await setDoc(customerRef, newCustomerData);
        }

        return { message: `Customer ${id ? 'updated' : 'created'} successfully.`, error: false };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to save customer: ${errorMessage}`, error: true };
    }
}

export async function deleteCustomer(customerId: string) {
    try {
        await deleteDoc(doc(db, "customers", customerId));
        revalidatePath("/superadmin/customers");
        return { message: "Customer deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete customer: ${errorMessage}`, error: true };
    }
}


export async function getCustomers(): Promise<Customer[]> {
  const customerQuery = query(collection(db, 'customers'));
  const [customerSnapshot, ordersSnapshot, loyaltySettings] = await Promise.all([
    getDocs(customerQuery),
    getDocs(query(collection(db, 'orders'))),
    getLoyaltySettings()
  ]);

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
    feedbackEntries: Feedback[];
} | null> {
    const decodedCustomerId = decodeURIComponent(customerId);
    const customerRef = doc(db, 'customers', decodedCustomerId);
    const customerSnap = await getDoc(customerRef);

    if (!customerSnap.exists()) {
        return null;
    }

    const customerData = customerSnap.data();
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

    const ordersQuery = query(
        collection(db, 'orders'),
        where('customerDetails.id', '==', decodedCustomerId),
        where('brandId','==',customer.brandId)
    );
    
    const ordersSnapshot = await getDocs(ordersQuery);
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
    // Fetch feedback data
    const feedbackQuery = query(collection(db, 'feedback'), where('customerId', '==', decodedCustomerId), where('brandId', '==', customer.brandId));
    const feedbackSnapshot = await getDocs(feedbackQuery);
    const feedbackEntries = feedbackSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
          ...data,
          id: doc.id,
          receivedAt: (data.receivedAt as Timestamp).toDate(),
      } as Feedback;
    });

    const totalRating = feedbackEntries.reduce((sum, f) => sum + f.rating, 0);
    const averageFeedbackRating = feedbackEntries.length > 0 ? totalRating / feedbackEntries.length : 0;
    const orderIdsWithFeedback = feedbackEntries.map(f => f.orderId);

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
    };
}
