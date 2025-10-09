'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Brand, Subscription } from '@/types';
import { BrandBillingDetails } from '@/components/superadmin/brand-billing-details';

type BrandWithBilling = Brand & {
  planName: string;
  subscriptionStatus: Subscription['status'];
  mrr: number;
};

interface BillingClientPageProps {
  initialBrands: BrandWithBilling[];
}

const statusVariantMap: Record<Subscription['status'], 'default' | 'secondary' | 'destructive'> = {
    active: 'default',
    trialing: 'default',
    past_due: 'destructive',
    canceled: 'secondary',
    unpaid: 'destructive',
    inactive: 'secondary',
};

export function BillingClientPage({ initialBrands }: BillingClientPageProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  const handleRowClick = (brandId: string) => {
    setSelectedBrandId(brandId);
    setIsSheetOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Brand Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">MRR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialBrands.map((brand) => (
                <TableRow key={brand.id} onClick={() => handleRowClick(brand.id)} className="cursor-pointer">
                  <TableCell className="font-medium">{brand.name}</TableCell>
                  <TableCell>
                    <Badge variant={brand.status === 'active' ? 'default' : 'secondary'}>
                      {brand.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariantMap[brand.subscriptionStatus] ?? 'secondary'}>
                      {brand.subscriptionStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>{brand.planName}</TableCell>
                  <TableCell className="text-right">kr.{brand.mrr.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {selectedBrandId && (
        <BrandBillingDetails
            brandId={selectedBrandId}
            isOpen={isSheetOpen}
            setIsOpen={setIsSheetOpen}
        />
      )}
    </>
  );
}
