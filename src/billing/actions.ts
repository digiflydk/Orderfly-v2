

'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { collection, getDocs, doc, getDoc, query, where, updateDoc } from 'firebase/firestore';
import type { Brand, Subscription, SubscriptionPlan, User, Invoice } from '@/types';
import { getBrands } from '../brands/actions';
import { getUsers } from '../users/actions';
import { getSubscriptionPlans } from '../subscriptions/page';
import { getActiveStripeKey } from '../settings/actions';
import Stripe from 'stripe';

async function getSubscriptions(): Promise<Subscription[]> {
    const db = getAdminDb();
    const querySnapshot = await getDocs(collection(db, "subscriptions"));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), currentPeriodStart: (doc.data().currentPeriodStart).toDate(), currentPeriodEnd: (doc.data().currentPeriodEnd).toDate() })) as Subscription[];
}

async function getInvoices(brandId?: string): Promise<Invoice[]> {
    // This is more complex in a real scenario, often involving Stripe API calls
    // For now, we simulate by returning an empty array as there's no "invoices" collection.
    return Promise.resolve([]);
}


export async function getBillingDashboardData() {
    const [brands, plans, subscriptions] = await Promise.all([
        getBrands(),
        getSubscriptionPlans(),
        getSubscriptions()
    ]);

    const brandsWithBilling = brands.map(brand => {
        const subscription = subscriptions.find(s => s.brandId === brand.id);
        const plan = plans.find(p => p.id === brand.subscriptionPlanId);
        return {
            ...brand,
            planName: plan?.name || 'N/A',
            subscriptionStatus: subscription?.status || 'inactive',
            mrr: subscription?.status === 'active' ? plan?.priceMonthly ?? 0 : 0,
        };
    });

    const totalMrr = brandsWithBilling.reduce((acc, brand) => acc + brand.mrr, 0);
    const payingBrands = brandsWithBilling.filter(b => b.subscriptionStatus === 'active').length;
    const paymentIssues = brandsWithBilling.filter(b => b.subscriptionStatus === 'past_due').length;

    return {
        metrics: {
            totalMrr,
            payingBrands,
            totalBrands: brands.length,
            paymentIssues,
        },
        brands: brandsWithBilling,
    };
}


export async function getBrandBillingDetails(brandId: string) {
    const db = getAdminDb();
    const [brandDoc, subscriptionDocs] = await Promise.all([
        getDoc(doc(db, 'brands', brandId)),
        getDocs(query(collection(db, 'subscriptions'), where('brandId', '==', brandId)))
    ]);

    if (!brandDoc.exists()) throw new Error('Brand not found');

    const brand = { id: brandDoc.id, ...brandDoc.data() } as Brand;
    
    let owner: User | null = null;
    if (brand.ownerId) {
        const ownerDoc = await getDoc(doc(db, 'users', brand.ownerId));
        if (ownerDoc.exists()) {
            owner = ownerDoc.data() as User;
        }
    }
    
    let plan: SubscriptionPlan | null = null;
    if (brand.subscriptionPlanId) {
        const planDoc = await getDoc(doc(db, 'subscription_plans', brand.subscriptionPlanId));
        if (planDoc.exists()) {
            plan = { id: planDoc.id, ...planDoc.data() } as SubscriptionPlan;
        }
    }

    const subscription = !subscriptionDocs.empty ? { id: subscriptionDocs.docs[0].id, ...subscriptionDocs.docs[0].data() } as Subscription : null;
    const invoices = await getInvoices(brandId);

    return {
        brand: {
            ...brand,
            ownerName: owner?.name || 'N/A',
            planName: plan?.name || 'N/A',
        },
        subscription,
        invoices,
    };
}

export async function updateBrandStatus(brandId: string, status: Brand['status']) {
    try {
        const db = getAdminDb();
        await updateDoc(doc(db, 'brands', brandId), { status });
        revalidatePath('/superadmin/billing');
        return { message: 'Brand status updated successfully.', error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to update status: ${errorMessage}`, error: true };
    }
}


export async function createStripePortalLink(brandId: string) {
    try {
        const db = getAdminDb();
        const stripeKey = await getActiveStripeKey();
        if (!stripeKey) throw new Error('Stripe API key is not configured.');
        
        const stripe = new Stripe(stripeKey);

        const q = query(collection(db, 'subscriptions'), where('brandId', '==', brandId));
        const subSnapshot = await getDocs(q);

        if (subSnapshot.empty) {
            return { url: null, error: 'No subscription found for this brand to create a portal link.' };
        }
        
        const subscription = subSnapshot.docs[0].data() as Subscription;
        const customerId = subscription.paymentProviderCustomerId;

        if (!customerId) {
            return { url: null, error: 'Stripe Customer ID not found for this brand.' };
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/superadmin/billing`,
        });

        return { url: portalSession.url, error: null };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { url: null, error: `Failed to create Stripe portal link: ${errorMessage}` };
    }
}
