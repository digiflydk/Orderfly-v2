
import type { Subscription, User, Brand, Location, Category, ToppingGroup, Topping, Allergen, FoodCategory, SubscriptionPlan, Role, Product, OrderSummary, Customer } from '@/types';

// This file is now only for data that is NOT managed by the SuperAdmin.
// User data is now fetched directly from Firestore.

export const MOCK_SUBSCRIPTIONS: Subscription[] = [
    {
        id: 'sub-1',
        brandId: 'brand-gourmet',
        planId: 'plan-pro',
        status: 'active',
        currentPeriodStart: new Date('2024-07-01'),
        currentPeriodEnd: new Date('2024-08-01'),
        paymentProviderCustomerId: 'cus_gourmet',
        paymentProviderSubscriptionId: 'sub_gourmet_pro',
    },
    {
        id: 'sub-2',
        brandId: 'brand-sushi',
        planId: 'plan-enterprise',
        status: 'past_due',
        currentPeriodStart: new Date('2024-06-15'),
        currentPeriodEnd: new Date('2024-07-15'),
        paymentProviderCustomerId: 'cus_sushi',
        paymentProviderSubscriptionId: 'sub_sushi_ent',
    },
    {
        id: 'sub-3',
        brandId: 'brand-pizza',
        planId: 'plan-starter',
        status: 'canceled',
        currentPeriodStart: new Date('2024-05-20'),
        currentPeriodEnd: new Date('2024-06-20'),
        paymentProviderCustomerId: 'cus_pizza',
        paymentProviderSubscriptionId: 'sub_pizza_starter',
    }
];

export const MOCK_INVOICES = [
    { id: 'inv-1', brandId: 'brand-gourmet', date: '2024-07-01', status: 'paid', amount: 99.00 },
    { id: 'inv-2', brandId: 'brand-gourmet', date: '2024-06-01', status: 'paid', amount: 99.00 },
    { id: 'inv-3', brandId: 'brand-sushi', date: '2024-06-15', status: 'paid', amount: 249.00 },
    { id: 'inv-4', brandId: 'brand-sushi', date: '2024-07-15', status: 'open', amount: 249.00 },
];
