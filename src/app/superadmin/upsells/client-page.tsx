

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Search, X, Eye } from "lucide-react";
import type { Upsell, Brand } from '@/types';
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
import { deleteUpsell } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toZonedTime, format } from 'date-fns-tz';

type UpsellWithDetails = Upsell & { brandName: string };

interface UpsellsClientPageProps {
    initialUpsells: UpsellWithDetails[];
    brands: Brand[];
}

export function UpsellsClientPage({ initialUpsells, brands }: UpsellsClientPageProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [upsellToDelete, setUpsellToDelete] = useState<string | null>(null);

  const filteredUpsells = useMemo(() => {
    return initialUpsells.filter(upsell => {
      const searchMatch = searchQuery === '' || 
        upsell.upsellName.toLowerCase().includes(searchQuery.toLowerCase());
      
      const brandMatch = brandFilter === 'all' || upsell.brandId === brandFilter;

      const statusMatch = statusFilter === 'all' || (statusFilter === 'active' && upsell.isActive) || (statusFilter === 'inactive' && !upsell.isActive);

      return searchMatch && brandMatch && statusMatch;
    });
  }, [initialUpsells, searchQuery, brandFilter, statusFilter]);
  
  const confirmDelete = (upsellId: string) => {
    setUpsellToDelete(upsellId);
    setIsAlertOpen(true);
  }

  const handleDelete = async () => {
    if (!upsellToDelete) return;
    const result = await deleteUpsell(upsellToDelete);
    if(result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
    }
    setIsAlertOpen(false);
    setUpsellToDelete(null);
  }

  const clearFilters = () => {
    setSearchQuery('');
    setBrandFilter('all');
    setStatusFilter('all');
  }

  const isFiltered = searchQuery !== '' || brandFilter !== 'all' || statusFilter !== 'all';
  
  function formatDate(dateString: string | Date | null | undefined) {
    if (!dateString) return 'N/A';
    try {
        const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
        const utcDate = toZonedTime(date, 'UTC');
        return format(utcDate, 'dd MMM yyyy, HH:mm');
    } catch (e) {
        return 'Invalid Date';
    }
  }

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Upsell Promotions</h1>
          <p className="text-muted-foreground">
            Create, view, and manage all upsell campaigns across all brands.
          </p>
        </div>
        <Button asChild>
            <Link href="/superadmin/upsells/new">
                <PlusCircle className="mr-2" />
                Add New Upsell
            </Link>
        </Button>
      </div>

       <Card>
            <CardContent className="p-4 flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by upsell name..."
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
                <TableHead>Upsell Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Conversions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUpsells.map((upsell) => (
                <TableRow key={upsell.id}>
                  <TableCell className="font-medium">{upsell.upsellName}</TableCell>
                  <TableCell>{upsell.brandName}</TableCell>
                  <TableCell className="text-xs capitalize">{upsell.triggerConditions.map(t => t.type.replace(/_/g, ' ')).join(', ')}</TableCell>
                   <TableCell>
                    <Badge variant={upsell.isActive ? 'default' : 'secondary'}>
                      {upsell.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{upsell.conversions} / {upsell.views}</TableCell>
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
                          <Link href={`/superadmin/upsells/edit/${upsell.id}`}><Eye className="mr-2 h-4 w-4" /> View Details</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/superadmin/upsells/edit/${upsell.id}`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => confirmDelete(upsell.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredUpsells.length === 0 && (
                <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No upsells found.
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
                    This action cannot be undone. This will permanently delete this upsell campaign.
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
