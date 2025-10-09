
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Search, X, Eye } from "lucide-react";
import type { Discount, Brand } from '@/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { deleteDiscount } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type DiscountWithDetails = Discount & { brandName: string };

interface DiscountsClientPageProps {
    initialDiscounts: DiscountWithDetails[];
    brands: Brand[];
}

export function DiscountsClientPage({ initialDiscounts, brands }: DiscountsClientPageProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [discountToDelete, setDiscountToDelete] = useState<string | null>(null);

  const filteredDiscounts = useMemo(() => {
    return initialDiscounts.filter(discount => {
      const searchMatch = searchQuery === '' || 
        discount.code.toLowerCase().includes(searchQuery.toLowerCase());
      
      const brandMatch = brandFilter === 'all' || discount.brandId === brandFilter;

      const statusMatch = statusFilter === 'all' || (statusFilter === 'active' && discount.isActive) || (statusFilter === 'inactive' && !discount.isActive);

      return searchMatch && brandMatch && statusMatch;
    });
  }, [initialDiscounts, searchQuery, brandFilter, statusFilter]);
  
  const confirmDelete = (discountId: string) => {
    setDiscountToDelete(discountId);
    setIsAlertOpen(true);
  }

  const handleDelete = async () => {
    if (!discountToDelete) return;
    const result = await deleteDiscount(discountToDelete);
    if(result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
    }
    setIsAlertOpen(false);
    setDiscountToDelete(null);
  }

  const clearFilters = () => {
    setSearchQuery('');
    setBrandFilter('all');
    setStatusFilter('all');
  }

  const isFiltered = searchQuery !== '' || brandFilter !== 'all' || statusFilter !== 'all';
  
  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Discount Codes</h1>
          <p className="text-muted-foreground">
            Create, manage, and track all discount codes.
          </p>
        </div>
        <Button asChild>
            <Link href="/superadmin/discounts/new">
                <PlusCircle className="mr-2" />
                Add New Discount
            </Link>
        </Button>
      </div>

       <Card>
            <CardContent className="p-4 flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by code..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Filter by brand..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Brands</SelectItem>
                        {brands.map(brand => (
                        <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                 <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by status..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                </Select>
                {isFiltered && (
                    <Button variant="ghost" onClick={clearFilters}>
                        <X className="mr-2 h-4 w-4" /> Clear
                    </Button>
                )}
            </CardContent>
       </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDiscounts.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-sm">{d.code}</TableCell>
                  <TableCell>{d.brandName}</TableCell>
                  <TableCell>
                    {d.discountType === 'percentage' ? `${d.discountValue}%` : `kr. ${d.discountValue.toFixed(2)}`}
                  </TableCell>
                  <TableCell>{d.usedCount} / {d.usageLimit === 0 ? '∞' : d.usageLimit}</TableCell>
                   <TableCell>
                    <Badge variant={d.isActive ? 'default' : 'secondary'}>
                      {d.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
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
                          <Link href={`/superadmin/discounts/edit/${d.id}`}><Eye className="mr-2 h-4 w-4" /> View Details</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/superadmin/discounts/edit/${d.id}`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => confirmDelete(d.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredDiscounts.length === 0 && (
                <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No discounts found.
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete this discount code.
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
