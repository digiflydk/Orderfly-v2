

'use client';

import { useState, useMemo } from 'react';
import Link from '@/components/superadmin/admin-link';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, X, MoreHorizontal, Edit, Trash2, Star, Eye } from "lucide-react";
import type { Customer, Brand } from '@/types';
import type { CustomerListRow } from '@/lib/customers/list-view';
import type { DirectoryEntry } from '@/lib/customers/directory';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { CustomerForm } from '@/components/superadmin/customer-form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteCustomer } from './actions';
import { useRouter } from 'next/navigation';


type CustomerWithDetails = CustomerListRow;

interface CustomersClientPageProps {
    initialCustomers: CustomerWithDetails[];
    brands: Pick<Brand, 'id' | 'name'>[];
    entries: DirectoryEntry[];
    brandNames: Record<string, string>;
}

const loyaltyVariantMap: Record<string, 'default' | 'secondary' | 'destructive'> = {
    'Loyal': 'default',
    'Occasional': 'secondary',
    'At Risk': 'destructive',
    'New': 'secondary'
};

export function CustomersClientPage({ initialCustomers, brands, entries, brandNames }: CustomersClientPageProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const activityByCustomerId = useMemo(() => new Map(entries.flatMap(entry => entry.sources
    .filter(source => source.kind === 'customer').map(source => [source.id, entry] as const))), [entries]);


  const filteredCustomers = useMemo(() => {
    return initialCustomers.filter(customer => {
      const searchLower = searchQuery.toLowerCase();
      const searchMatch = searchQuery === '' || 
        customer.fullName.toLowerCase().includes(searchLower) ||
        customer.email.toLowerCase().includes(searchLower) ||
        customer.phone.includes(searchQuery);
      
      const brandMatch = brandFilter === 'all' || customer.brandId === brandFilter;
      const statusMatch = statusFilter === 'all' || customer.status === statusFilter;
      
      return searchMatch && brandMatch && statusMatch;
    });
  }, [initialCustomers, searchQuery, brandFilter, statusFilter]);
  const gameOnlyContacts = useMemo(() => entries.filter(entry => entry.customerIds.length === 0
    && statusFilter === 'all'
    && (brandFilter === 'all' || entry.brandIds.includes(brandFilter))
    && (!searchQuery || [entry.name, entry.email, entry.phone].some(value => value.toLowerCase().includes(searchQuery.toLowerCase())))),
    [entries, searchQuery, brandFilter, statusFilter]);
  
  const handleRowClick = (customerId: string) => {
    router.push(`/superadmin/customers/${encodeURIComponent(customerId)}`);
  }

  const handleEdit = (e: React.MouseEvent, customer: CustomerWithDetails) => {
    e.stopPropagation(); // Prevent row click navigation
    setSelectedCustomer(customer as unknown as Customer);
    setIsFormOpen(true);
  };
  
  const confirmDelete = (e: React.MouseEvent, customerId: string) => {
    e.stopPropagation();
    setCustomerToDelete(customerId);
    setIsAlertOpen(true);
  }

  const handleDelete = async () => {
    if (!customerToDelete) return;
    const result = await deleteCustomer(customerToDelete);
    if(result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
    }
    setIsAlertOpen(false);
    setCustomerToDelete(null);
  }

  const clearFilters = () => {
    setSearchQuery('');
    setBrandFilter('all');
    setStatusFilter('all');
  }
  
  const formatDateSafe = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = parse(dateString, 'yyyy-MM-dd', new Date());
      return format(date, 'MMM d, yyyy');
    } catch (e) {
      console.error("Failed to parse date:", dateString, e);
      return 'Invalid Date';
    }
  };

  const isFiltered = searchQuery !== '' || brandFilter !== 'all' || statusFilter !== 'all';

  return (
    <>
        <div className="space-y-4">
        <div className="flex items-center justify-between space-y-2">
            <div>
            <h1 className="text-2xl font-bold tracking-tight">Customer Management</h1>
            <p className="text-muted-foreground">
                Search, filter, and view all customers across the platform.
            </p>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
            />
            </div>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger>
                <SelectValue placeholder="Filter by brand..." />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map(brand => (
                <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                ))}
            </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                <SelectValue placeholder="Filter by status..." />
                </SelectTrigger>
                <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
            </Select>
            {isFiltered && (
                <Button variant="ghost" onClick={clearFilters} size="icon">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Clear filters</span>
                </Button>
            )}
            </div>
        </div>

        <Card>
            <CardContent className="overflow-x-auto pt-6">
            <Table className="min-w-[1100px]">
                <TableHeader>
                <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Loyalty</TableHead>
                    <TableHead>Last Order</TableHead>
                    <TableHead>Games</TableHead>
                    <TableHead>Purchases by merchant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {filteredCustomers.map((customer) => {
                  const activity=activityByCustomerId.get(customer.id);
                  const games=activity?.sources.filter(source=>source.kind==='game')||[];
                  const purchases=activity?.sources.filter(source=>source.kind==='customer'&&(source.totalOrders||0)>0)||[];
                  return (
                    <TableRow key={customer.id} onClick={() => handleRowClick(customer.id)} className="cursor-pointer">
                    <TableCell>
                        <p className="font-medium">{customer.fullName}</p>
                        <p className="text-sm text-muted-foreground">{customer.email}</p>
                    </TableCell>
                    <TableCell>{customer.brandName}</TableCell>
                    <TableCell>
                        <Badge variant={loyaltyVariantMap[customer.loyaltyClassification] ?? 'secondary'}>
                            <Star className="mr-1 h-3 w-3" />
                            {customer.loyaltyScore} - {customer.loyaltyClassification}
                        </Badge>
                    </TableCell>
                    <TableCell>
                        {formatDateSafe(customer.lastOrderDate)}
                    </TableCell>
                    <TableCell>{games.length ? <div className="space-y-1">{games.map(game=><p key={`${game.brandId}:${game.id}`} className="text-xs">{game.campaignName||'Scratch card'} · {brandNames[game.brandId]||game.brandId}</p>)}</div> : '—'}</TableCell>
                    <TableCell>{purchases.length ? <div className="space-y-1">{purchases.map(source=><p key={`${source.brandId}:${source.id}`} className="text-xs">{brandNames[source.brandId]||source.brandId}: {source.totalOrders} · {(source.totalSpend||0).toLocaleString('da-DK',{style:'currency',currency:'DKK'})}</p>)}</div> : '—'}</TableCell>
                    <TableCell>
                        <Badge variant={customer.status === 'active' ? 'default' : 'secondary'}>
                        {customer.status}
                        </Badge>
                    </TableCell>
                     <TableCell className="text-right">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => handleRowClick(customer.id)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={(e) => handleEdit(e as any, customer)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={(e) => confirmDelete(e as any, customer.id)} className="text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                    </TableRow>
                  );
                })}
                {gameOnlyContacts.map(entry => {
                  const games=entry.sources.filter(source=>source.kind==='game');
                  return <TableRow key={entry.id} onClick={()=>router.push(`/superadmin/customers/directory/${entry.id}`)} className="cursor-pointer">
                    <TableCell><p className="font-medium">{entry.name}</p><p className="text-sm text-muted-foreground">{entry.email}</p></TableCell>
                    <TableCell>{entry.brandIds.map(id=>brandNames[id]||id).join(', ')}</TableCell>
                    <TableCell>—</TableCell><TableCell>—</TableCell>
                    <TableCell>{games.map(game=><p key={`${game.brandId}:${game.id}`} className="text-xs">{game.campaignName||'Scratch card'} · {brandNames[game.brandId]||game.brandId}</p>)}</TableCell>
                    <TableCell>{games.filter(game=>game.externalOrders).map(game=><p key={`${game.brandId}:${game.id}`} className="text-xs">{brandNames[game.brandId]||game.brandId}: {game.externalOrders} · {(game.externalSpend||0).toLocaleString('da-DK',{style:'currency',currency:'DKK'})}</p>)}{!entry.totalOrders&&'—'}</TableCell>
                    <TableCell><Badge variant="secondary">Game signup</Badge></TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={event=>{event.stopPropagation();router.push(`/superadmin/customers/directory/${entry.id}`);}}>View Details</Button></TableCell>
                  </TableRow>;
                })}
                {filteredCustomers.length === 0 && gameOnlyContacts.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                            No customers found matching your criteria.
                        </TableCell>
                    </TableRow>
                )}
                </TableBody>
            </Table>
            </CardContent>
        </Card>
        </div>

        <CustomerForm
            isOpen={isFormOpen}
            setIsOpen={setIsFormOpen}
            customer={selectedCustomer}
        />

        <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the customer record.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
