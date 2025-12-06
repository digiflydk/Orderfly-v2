
'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
    getBrandBillingDetails,
    updateBrandStatus,
    createStripePortalLink,
} from '@/app/superadmin/billing/actions';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useToast } from '@/hooks/use-toast';
import type { Brand } from '@/types';
import { Loader2 } from 'lucide-react';

interface BrandBillingDetailsProps {
  brandId: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

type BillingDetails = NonNullable<Awaited<ReturnType<typeof getBrandBillingDetails>>>;

function LoadingSkeleton() {
    return (
        <div className="p-6 space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
            </div>
            <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
            </div>
            <Separator />
            <div className="space-y-2">
                <Skeleton className="h-5 w-1/4" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
        </div>
    )
}

export function BrandBillingDetails({ brandId, isOpen, setIsOpen }: BrandBillingDetailsProps) {
  const [details, setDetails] = useState<BillingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && brandId) {
      setIsLoading(true);
      getBrandBillingDetails(brandId)
        .then(data => setDetails(data))
        .catch(err => {
            console.error(err);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to fetch brand details.' });
            setIsOpen(false);
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, brandId, toast, setIsOpen]);

  const handleStatusChange = (status: Brand['status']) => {
    if (!details) return;
    startTransition(async () => {
        const result = await updateBrandStatus(details.brand.id, status);
        if(result.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success!', description: result.message });
            // Refresh details
            const updatedDetails = await getBrandBillingDetails(details.brand.id);
            setDetails(updatedDetails);
        }
    })
  }

  const handleManageInStripe = () => {
    if (!details) return;
    startTransition(async () => {
        const { url, error } = await createStripePortalLink(details.brand.id);
        if (error) {
            toast({ variant: 'destructive', title: 'Error', description: error });
        } else if (url) {
            window.open(url, '_blank');
        }
    })
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        {isLoading ? <LoadingSkeleton /> : details && (
            <>
                <SheetHeader>
                    <SheetTitle>{details.brand.name}</SheetTitle>
                    <SheetDescription>
                        Owner: {details.brand.ownerName}
                    </SheetDescription>
                </SheetHeader>
                <div className="space-y-6 py-6">
                    {/* Brand & Subscription Status */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="font-medium">Brand Status</span>
                            <Select onValueChange={handleStatusChange} defaultValue={details.brand.status} disabled={isPending}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Change status..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="suspended">Suspended</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="flex items-center justify-between">
                            <span className="font-medium">Subscription</span>
                             <Badge variant={details.subscription?.status === 'active' ? 'default' : 'destructive'}>
                                {details.subscription?.status ?? 'Inactive'}
                            </Badge>
                        </div>
                        <Button onClick={handleManageInStripe} disabled={isPending} className="w-full">
                            {isPending && <Loader2 className="animate-spin mr-2" />}
                            Manage in Stripe
                        </Button>
                    </div>

                    <Separator />

                    {/* Invoice History */}
                    <div>
                        <h3 className="font-semibold mb-2">Invoice History</h3>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {details.invoices.map(invoice => (
                                    <TableRow key={invoice.id}>
                                        <TableCell>{invoice.date}</TableCell>
                                        <TableCell>
                                             <Badge variant={invoice.status === 'paid' ? 'default' : 'destructive'}>
                                                {invoice.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">kr.{invoice.amount.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                                {details.invoices.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center text-muted-foreground">No invoices found.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </>
        )}
      </SheetContent>
    </Sheet>
  );
}
