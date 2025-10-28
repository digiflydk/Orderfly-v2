
'use client';

import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, X, MoreHorizontal, Eye, CheckCircle, Ban, Truck } from "lucide-react";
import type { OrderSummary, Brand, Location, OrderStatus } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from '@/components/ui/dropdown-menu';
import { toZonedTime, format } from 'date-fns-tz';
import { updateOrderStatus } from '@/app/superadmin/sales/orders/actions';

export type ClientOrderSummary = Omit<OrderSummary, 'createdAt'> & {
    createdAt: string;
};

interface OrdersClientPageProps {
    initialOrders: ClientOrderSummary[];
    brands: Brand[];
    locations: Location[];
    initialFilters?: {
        dateFrom: string;
        dateTo: string;
        brandId: string;
        locationIds: string[];
    };
}

const statusVariantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    'Completed': 'default',
    'Delivered': 'default',
    'Ready': 'default',
    'Paid': 'default',
    'In Progress': 'secondary',
    'Received': 'secondary',
    'Pending': 'secondary',
    'Canceled': 'destructive',
    'Error': 'destructive',
    'Failed': 'destructive',
};

const paymentMethodVariantMap: Record<string, 'default' | 'secondary' | 'outline'> = {
    'Stripe': 'default',
    'Cash': 'secondary',
    'Other': 'outline',
};

const OrdersClientPage = ({ initialOrders, brands, locations }: OrdersClientPageProps) => {
  const { toast } = useToast();
  const [orders, setOrders] = useState(initialOrders);
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
      brandId: 'all',
      locationId: 'all',
      orderStatus: 'all',
      paymentStatus: 'all',
  });

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const searchLower = searchQuery.toLowerCase();
      const searchMatch = searchQuery === '' || 
        order.id.toLowerCase().includes(searchLower) ||
        order.customerName.toLowerCase().includes(searchLower) ||
        order.customerContact.toLowerCase().includes(searchLower);
      
      const brandMatch = filters.brandId === 'all' || order.brandId === filters.brandId;
      const locationMatch = filters.locationId === 'all' || order.locationId === filters.locationId;
      const orderStatusMatch = filters.orderStatus === 'all' || order.status === filters.orderStatus;
      const paymentStatusMatch = filters.paymentStatus === 'all' || order.paymentStatus === filters.paymentStatus;
      
      return searchMatch && brandMatch && locationMatch && orderStatusMatch && paymentStatusMatch;
    });
  }, [orders, searchQuery, filters]);
  
  const handleFilterChange = (filterName: keyof typeof filters, value: string) => {
      setFilters(prev => ({...prev, [filterName]: value}));
  }

  const clearFilters = () => {
    setSearchQuery('');
    setFilters({
        brandId: 'all',
        locationId: 'all',
        orderStatus: 'all',
        paymentStatus: 'all',
    });
  }

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

  const isFiltered = searchQuery !== '' || Object.values(filters).some(v => v !== 'all');
  
  const availableLocations = useMemo(() => {
      if (filters.brandId === 'all') return locations;
      return locations.filter(l => l.brandId === filters.brandId);
  }, [filters.brandId, locations]);
  
  const formatDate = (dateString: string) => {
    const zonedDate = toZonedTime(dateString, 'UTC');
    return format(zonedDate, 'MMM d, yyyy HH:mm', { timeZone: 'UTC' });
  };


  return (
    <div className="space-y-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight">All Orders</h1>
            <p className="text-muted-foreground">
                Search, filter, and view all orders across the platform.
            </p>
        </div>

        <Card>
            <CardContent className="p-4 space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    <div className="relative xl:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by Order ID, Name, Email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                    </div>
                     <Select value={filters.brandId} onValueChange={(v) => {handleFilterChange('brandId', v); handleFilterChange('locationId', 'all')}}>
                        <SelectTrigger><SelectValue placeholder="Filter by brand..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Brands</SelectItem>
                            {brands.map(brand => (<SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>))}
                        </SelectContent>
                    </Select>
                     <Select value={filters.locationId} onValueChange={(v) => handleFilterChange('locationId', v)} disabled={filters.brandId === 'all'}>
                        <SelectTrigger><SelectValue placeholder="Filter by location..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Locations</SelectItem>
                            {availableLocations.map(loc => (<SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>))}
                        </SelectContent>
                    </Select>
                     <Select value={filters.orderStatus} onValueChange={(v) => handleFilterChange('orderStatus', v)}>
                        <SelectTrigger><SelectValue placeholder="Filter by status..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            {['Received', 'In Progress', 'Ready', 'Completed', 'Delivered', 'Canceled'].map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                        </SelectContent>
                    </Select>
                </div>
                 {isFiltered && (
                    <Button variant="ghost" onClick={clearFilters} className="h-8 px-4">
                        <X className="mr-2 h-4 w-4" /> Clear Filters
                    </Button>
                )}
            </CardContent>
        </Card>

        <Card>
            <CardContent className="pt-6">
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
};

export default OrdersClientPage;
