
// src/app/api/superadmin/docs/db-structure/route.ts
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

type Field = { name: string; type: string; optional?: boolean };

type CollectionSchema = {
  collection: string;
  description: string;
  keyFields: Field[];
};

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const schema: CollectionSchema[] = [
    {
      collection: 'brands',
      description: 'Top level brand entities.',
      keyFields: [
        { name: 'name', type: 'string' },
        { name: 'slug', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'createdAt', type: 'Timestamp' },
        { name: 'ownerId', type: 'string (ref: users)' },
      ],
    },
    {
      collection: 'locations',
      description: 'All locations for all brands.',
      keyFields: [
        { name: 'brandId', type: 'string (ref: brands)' },
        { name: 'name', type: 'string' },
        { name: 'slug', type: 'string' },
        { name: 'isActive', type: 'boolean' },
      ],
    },
    {
      collection: 'products',
      description: 'Global catalog of all products.',
      keyFields: [
        { name: 'brandId', type: 'string (ref: brands)' },
        { name: 'categoryId', type: 'string (ref: categories)' },
        { name: 'productName', type: 'string' },
        { name: 'price', type: 'number' },
        { name: 'isActive', type: 'boolean' },
      ],
    },
    {
      collection: 'orders',
      description: 'All customer orders.',
      keyFields: [
        { name: 'brandId', type: 'string (ref: brands)' },
        { name: 'locationId', type: 'string (ref: locations)' },
        { name: 'status', type: 'string' },
        { name: 'totalAmount', type: 'number' },
        { name: 'createdAt', type: 'Timestamp' },
      ],
    },
    {
      collection: 'customers',
      description: 'Aggregated customer data.',
      keyFields: [
          { name: 'email', type: 'string' },
          { name: 'totalOrders', type: 'number' },
          { name: 'totalSpend', type: 'number' },
          { name: 'loyaltyScore', type: 'number' },
      ]
    },
    {
        collection: 'feedback',
        description: 'Customer feedback entries.',
        keyFields: [
            { name: 'orderId', type: 'string (ref: orders)'},
            { name: 'rating', type: 'number'},
            { name: 'comment', type: 'string', optional: true},
            { name: 'receivedAt', type: 'Timestamp'},
        ]
    },
    {
        collection: 'platform_settings',
        description: 'Global settings for the platform.',
        keyFields: [
            { name: 'analytics', type: 'document' },
            { name: 'payment_gateway', type: 'document' },
            { name: 'branding', type: 'document' },
            { name: 'languages', type: 'document' },
            { name: 'loyalty', type: 'document' },
        ]
    }
  ];

  return NextResponse.json({ schema });
}
