
import type { OrderSummary, OrderDetail } from '@/types';

// This file is now only contains mock order summaries for cases where no orders are in the database.
// In a real app, this file would be removed entirely.
export const MOCK_ORDER_SUMMARIES: OrderSummary[] = [
    {
        id: 'ORD-756123',
        createdAt: new Date('2024-07-22T14:35:12Z'),
        customerName: 'Søren Kierkegaard',
        customerContact: 'existential@dread.com',
        brandId: 'brand-gourmet',
        brandName: 'Gourmet Burger',
        locationId: 'loc-gourmet-1',
        locationName: 'Copenhagen',
        deliveryType: 'Delivery',
        status: 'Completed',
        totalAmount: 255.50,
        paymentStatus: 'Paid',
        paymentMethod: 'Stripe',
    },
    {
        id: 'ORD-894561',
        createdAt: new Date('2024-07-22T12:15:45Z'),
        customerName: 'H.C. Andersen',
        customerContact: 'ugly@duckling.com',
        brandId: 'brand-sushi',
        brandName: 'Sushi World',
        locationId: 'loc-sushi-2',
        locationName: 'Odense',
        deliveryType: 'Pickup',
        status: 'Ready',
        totalAmount: 412.00,
        paymentStatus: 'Paid',
        paymentMethod: 'Stripe',
    },
    {
        id: 'ORD-123789',
        createdAt: new Date('2024-07-21T19:05:02Z'),
        customerName: 'Karen Blixen',
        customerContact: 'outof@africa.com',
        brandId: 'brand-pizza',
        brandName: 'Pizza Palace',
        locationId: 'loc-pizza-1',
        locationName: 'Aarhus',
        deliveryType: 'Delivery',
        status: 'Canceled',
        totalAmount: 180.00,
        paymentStatus: 'Failed',
        paymentMethod: 'Stripe',
    },
];

// This serves as a template for detailed order information.
// In a real app, this data would be fetched from a specific order document.
export const MOCK_ORDER_DETAIL_TEMPLATE = {
    productItems: [
        { name: 'Gourmet Cheeseburger', quantity: 2, unitPrice: 95.00, totalPrice: 190.00, toppings: ['Extra Bacon', 'Spicy Mayo'] },
        { name: 'Truffle Fries', quantity: 1, unitPrice: 45.00, totalPrice: 45.00 },
    ],
    paymentDetails: {
        subtotal: 235.00,
        taxes: 0,
        deliveryFee: 15.50,
        discountTotal: 0,
        tips: 0,
        paymentRefId: 'pi_3PciUBfNq3gXvW21xS7y8Zg',
    },
    customerDetails: {
        id: 'cust-001',
        address: 'Apple St 1, 12345 Fruitville, US',
        deliveryInstructions: 'Please ring the doorbell twice.',
    }
}
