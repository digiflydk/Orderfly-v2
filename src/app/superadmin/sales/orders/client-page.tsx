
'use client';

import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, X, MoreHorizontal, Eye, Truck, Ban } from "lucide-react";
import type { OrderSummary, Brand, Location, OrderStatus } from '@/types';
import type { SACommonFilters } from '@/types/superadmin';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from '@/components/ui/dropdown-menu';
import { toZonedTime, format } from 'date-fns-tz';
import { updateOrderStatus } from './actions';
import { FiltersBar } from '@/components/superadmin/FiltersBar';
import { useRouter, usePathname } from 'next/navigation';
import { toQuery } from '@/lib/utils/url';


export type ClientOrderSummary = Omit<OrderSummary, 'createdAt' | 'paidAt' | 'updatedAt'> & {
    createdAt: string;
    paidAt?: string;
    updatedAt?: string;
};

interface OrdersClientPageProps {
    initialOrders: ClientOrderSummary[];
    brands: Brand[];
    locations: Location[];
    initialFilters: SACommonFilters;
    onFilterChange: (newFilters: SACommonFilters) => void;
}

const statusVariantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    'Completed': 'default', 'Delivered': 'default', 'Ready': 'default', 'Paid': 'default',
    'In Progress': 'secondary', 'Received': 'secondary', 'Pending': 'secondary',
    'Canceled': 'destructive', 'Error': 'destructive', 'Failed': 'destructive',
};

export function OrdersClientPage({ initialOrders, brands, locations, initialFilters, onFilterChange }: OrdersClientPageProps) {
  const { toast } = useToast();
  const [orders, setOrders] = useState(initialOrders);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState('');
 

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const searchLower = searchQuery.toLowerCase();
      return searchQuery === '' || 
        order.id.toLowerCase().includes(searchLower) ||
        order.customerName.toLowerCase().includes(searchLower) ||
        order.customerContact.toLowerCase().includes(searchLower);
    });
  }, [orders, searchQuery]);


  const handleUpdateStatus = (orderId: string, status: OrderStatus) => {
    startTransition(async () => {
        const result = await updateOrderStatus(orderId, status);
        if (result.success) {
            toast({ title: "Success", description: result.message });
            setOrders(prev => prev.map(o => o.id === orderId ? {...o, status} : o));
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.message });
        }
    })
  }
  
  const formatDate = (dateString: string) => {
    const zonedDate = toZonedTime(dateString, 'UTC');
    return format(zonedDate, 'MMM d, yyyy HH:mm', { timeZone: 'UTC' });
  };

  return (
    <div className="space-y-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight">All Orders</h1>
            <p className="text-muted-foreground">Search, filter, and view all orders across the platform.</p>
        </div>
        
        <FiltersBar 
            value={initialFilters as SACommonFilters} 
            brands={brands} 
            locations={locations}
            onFilterChange={onFilterChange}
        />

        <Card>
            <CardContent className="pt-6">
                 <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by Order ID, Name, Email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filteredOrders.map((order) => (
                        <TableRow key={order.id}>
                            <TableCell className="font-mono text-xs">{order.id}</TableCell>
                            <TableCell>{formatDate(order.createdAt)}</TableCell>
                            <TableCell>
                                <p className="font-medium">{order.customerName}</p>
                                <p className="text-sm text-muted-foreground">{order.customerContact}</p>
                            </TableCell>
                            <TableCell>
                                <p className="font-medium">{order.locationName}</p>
                                <p className="text-sm text-muted-foreground">{order.brandName}</p>
                            </TableCell>
                            <TableCell>
                                <Badge variant={statusVariantMap[order.status] ?? 'secondary'}>{order.status}</Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant={statusVariantMap[order.paymentStatus] ?? 'secondary'}>{order.paymentStatus}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">kr.{order.totalAmount.toFixed(2)}</TableCell>
                            <TableCell className="text-right">
                            <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                            <span className="sr-only">Open menu</span>
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem asChild>
                                            <Link href={`/superadmin/sales/orders/${order.id}`}>
                                                <Eye className="mr-2 h-4 w-4" />
                                                View Details
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuSub>
                                            <DropdownMenuSubTrigger>
                                                Update Status
                                            </DropdownMenuSubTrigger>
                                            <DropdownMenuPortal>
                                                 <DropdownMenuSubContent>
                                                    <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'Delivered')}><Truck className="mr-2"/>Delivered</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'Canceled')} className="text-destructive"><Ban className="mr-2"/>Cancelled</DropdownMenuItem>
                                                </DropdownMenuSubContent>
                                            </DropdownMenuPortal>
                                        </DropdownMenuSub>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    ))}
                    {filteredOrders.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                No orders found matching your criteria.
                            </TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    </div>
  );
}
