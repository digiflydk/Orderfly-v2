

'use server';

import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, Timestamp, doc, writeBatch, setDoc, deleteDoc, getDoc, where } from 'firebase/firestore';
import type { Customer, OrderDetail, LoyaltySettings, Feedback } from '@/types';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
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
        id: formData.get('id') as string | undefined,
        fullName: formData.get('fullName'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        status: formData.get('status') === 'active',
    };
    
    const mappedData = {
        ...rawData,
        status: formData.get('status') ? 'active' : 'inactive',
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
             await setDoc(customerRef, customerData, { merge: true });
        } else {
            const newCustomerData = {
                ...customerData,
                id: docId,
                brandId: 'brand-gourmet', // Placeholder
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


function calculateLoyaltyScore(customer: Customer, orders: OrderDetail[], settings: LoyaltySettings): number {
    if (!customer || !settings) return 0;
    if (customer.totalOrders === 0) return 0;

    const { weights, thresholds, deliveryMethodBonus } = settings;

    let totalOrdersScore = 0;
    if (thresholds.totalOrders) {
        for (const t of thresholds.totalOrders.slice().reverse()) {
            if (customer.totalOrders >= t.value) {
                totalOrdersScore = t.points;
                break;
            }
        }
    }
    
    const avgOrderValue = customer.totalOrders > 0 ? customer.totalSpend / customer.totalOrders : 0;
    let avgOrderValueScore = 0;
    if (thresholds.averageOrderValue) {
        for (const t of thresholds.averageOrderValue.slice().reverse()) {
            if (avgOrderValue >= t.value) {
                avgOrderValueScore = t.points;
                break;
            }
        }
    }

    let recencyScore = 0;
    if (customer.lastOrderDate && thresholds.recency) {
        const daysSinceLastOrder = (new Date().getTime() - new Date(customer.lastOrderDate).getTime()) / (1000 * 3600 * 24);
        for (const t of thresholds.recency.slice().reverse()) {
            if (daysSinceLastOrder <= t.value) {
                recencyScore = t.points;
                break;
            }
        }
    }

    let frequencyScore = 50; 

    let deliveryMethodBonusScore = 0;
    if(orders.length > 1) {
        const firstDeliveryType = orders[0].deliveryType;
        if(orders.every(o => o.deliveryType === firstDeliveryType)) {
            deliveryMethodBonusScore = deliveryMethodBonus;
        }
    }
    

    const finalScore = 
        (totalOrdersScore * (weights.totalOrders / 100)) +
        (avgOrderValueScore * (weights.averageOrderValue / 100)) +
        (recencyScore * (weights.recency / 100)) +
        (frequencyScore * (weights.frequency / 100)) +
        (deliveryMethodBonusScore * (weights.deliveryMethodBonus / 100));

    return Math.round(finalScore);
}


export async function getCustomers(): Promise<Customer[]> {
  const customerQuery = query(collection(db, 'customers'), orderBy('lastOrderDate', 'desc'));
  const [customerSnapshot, ordersSnapshot, loyaltySettings] = await Promise.all([
    getDocs(customerQuery),
    getDocs(query(collection(db, 'orders'))),
    getLoyaltySettings()
  ]);

  const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrderDetail));
  const ordersByCustomerId = allOrders.reduce((acc, order) => {
      const customerId = order.customerDetails.id;
      if (!acc[customerId]) {
          acc[customerId] = [];
      }
      acc[customerId].push(order);
      return acc;
  }, {} as Record<string, OrderDetail[]>);

  const customers = customerSnapshot.docs.map(doc => {
      const data = doc.data() as Omit<Customer, 'id' | 'createdAt' | 'lastOrderDate'> & { createdAt: Timestamp, lastOrderDate?: Timestamp, cookie_consent?: any };
      const customerOrders = ordersByCustomerId[doc.id] || [];

      // Convert all timestamps to serializable format
      const customerForCalc: Customer = {
          id: doc.id,
          ...data,
          createdAt: data.createdAt.toDate(),
          lastOrderDate: data.lastOrderDate?.toDate(),
          cookie_consent: data.cookie_consent ? {
            ...data.cookie_consent,
            timestamp: (data.cookie_consent.timestamp as Timestamp).toDate(),
          } : undefined,
      } as Customer;
      
      const loyaltyScore = calculateLoyaltyScore(customerForCalc, customerOrders, loyaltySettings);
      
      let loyaltyClassification = 'New';
      if (customerForCalc.totalOrders > 0 && loyaltySettings?.classifications) {
          if (loyaltyScore >= loyaltySettings.classifications.loyal.min) {
              loyaltyClassification = 'Loyal';
          } else if (loyaltyScore >= loyaltySettings.classifications.occasional.min) {
              loyaltyClassification = 'Occasional';
          } else {
              loyaltyClassification = 'At Risk';
          }
      }

      return { 
          ...customerForCalc,
          loyaltyScore,
          loyaltyClassification,
      } as Customer;
  });

  return customers;
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
      createdAt: (customerData.createdAt as Timestamp).toDate(),
      lastOrderDate: (customerData.lastOrderDate as Timestamp)?.toDate(),
      cookie_consent: customerData.cookie_consent ? {
        ...customerData.cookie_consent,
        timestamp: (customerData.cookie_consent.timestamp as Timestamp).toDate(),
      } : undefined,
    };


    const customer: Customer = finalCustomerData as Customer;

    const ordersQuery = query(
        collection(db, 'orders'),
        where('customerDetails.id', '==', decodedCustomerId)
    );
    
    const ordersSnapshot = await getDocs(ordersQuery);
    const allOrders = ordersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            createdAt: (data.createdAt as Timestamp).toDate(),
        } as OrderDetail;
    }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Sort in-memory
        
    const deliveryOrdersCount = allOrders.filter(o => o.deliveryType === 'Delivery').length;
    const pickupOrdersCount = allOrders.filter(o => o.deliveryType === 'Pickup').length;
    
    // Simplified retention rate
    const retentionRate = customer.totalOrders > 1 ? 100 : 0;
    
    const loyaltySettings = await getLoyaltySettings();
    const loyaltyScore = calculateLoyaltyScore(customer, allOrders, loyaltySettings);
    
    let loyaltyClassification = 'New';
    if (customer.totalOrders > 0 && loyaltySettings?.classifications) {
      if (loyaltyScore >= loyaltySettings.classifications.loyal.min) {
        loyaltyClassification = 'Loyal';
      } else if (loyaltyScore >= loyaltySettings.classifications.occasional.min) {
        loyaltyClassification = 'Occasional';
      } else {
        loyaltyClassification = 'At Risk';
      }
    }
    
    // Fetch feedback data
    const feedbackQuery = query(collection(db, 'feedback'), where('customerId', '==', decodedCustomerId));
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
        customer,
        allOrders,
        deliveryOrdersCount,
        pickupOrdersCount,
        retentionRate,
        loyaltyScore,
        loyaltyClassification,
        averageFeedbackRating,
        orderIdsWithFeedback,
        feedbackEntries,
    };
}
