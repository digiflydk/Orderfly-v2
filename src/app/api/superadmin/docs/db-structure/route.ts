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
      ],
    },
    {
      collection: 'locations',
      description: 'All locations for all brands.',
      keyFields: [
        { name: 'brandId', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'slug', type: 'string' },
        { name: 'isActive', type: 'boolean' },
      ],
    },
    {
      collection: 'products',
      description: 'Global catalog of all products.',
      keyFields: [
        { name: 'brandId', type: 'string' },
        { name: 'categoryId', type: 'string' },
        { name: 'productName', type: 'string' },
        { name: 'price', type: 'number' },
      ],
    },
    {
      collection: 'orders',
      description: 'All customer orders.',
      keyFields: [
        { name: 'brandId', type: 'string' },
        { name: 'locationId', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'totalAmount', type: 'number' },
      ],
    },
  ];

  return NextResponse.json({ schema });
}
