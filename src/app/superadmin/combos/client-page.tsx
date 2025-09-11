

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Search, X, Eye } from "lucide-react";
import type { ComboMenu, Brand, Location } from '@/types';
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
import { deleteCombo } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toZonedTime, format } from 'date-fns-tz';

type ComboWithDetails = ComboMenu & { brandName: string, locationNames: string };

interface CombosClientPageProps {
    initialCombos: ComboWithDetails[];
    brands: Brand[];
    locations: Location[];
}

export function CombosClientPage({ initialCombos, brands, locations }: CombosClientPageProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [comboToDelete, setComboToDelete] = useState<string | null>(null);

  const filteredCombos = useMemo(() => {
    return initialCombos.filter(combo => {
      const searchMatch = searchQuery === '' || 
        combo.comboName.toLowerCase().includes(searchQuery.toLowerCase());
      
      const brandMatch = brandFilter === 'all' || combo.brandId === brandFilter;

      const statusMatch = statusFilter === 'all' || (statusFilter === 'active' && combo.isActive) || (statusFilter === 'inactive' && !combo.isActive);

      return searchMatch && brandMatch && statusMatch;
    });
  }, [initialCombos, searchQuery, brandFilter, statusFilter]);
  
  const confirmDelete = (comboId: string) => {
    setComboToDelete(comboId);
    setIsAlertOpen(true);
  }

  const handleDelete = async () => {
    if (!comboToDelete) return;
    const result = await deleteCombo(comboToDelete);
    if(result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
    }
    setIsAlertOpen(false);
    setComboToDelete(null);
  }

  const clearFilters = () => {
    setSearchQuery('');
    setBrandFilter('all');
    setStatusFilter('all');
  }

  const isFiltered = searchQuery !== '' || brandFilter !== 'all' || statusFilter !== 'all';
  
  const formatDate = (dateString?: string | Date) => {
    if (!dateString) return 'N/A';
    try {
        const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
        const utcDate = toZonedTime(date, 'UTC');
        return format(utcDate, 'dd MMM yyyy, HH:mm', { timeZone: 'UTC' });
    } catch (e) {
        return 'Invalid Date';
    }
  }

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Combo Menu Management</h1>
          <p className="text-muted-foreground">
            Create, view, and manage all combo menus across all brands.
          </p>
        </div>
        <Button asChild>
            <Link href="/superadmin/combos/new">
                <PlusCircle className="mr-2" />
                Add New Combo
            </Link>
        </Button>
      </div>

       <Card>
            <CardContent className="p-4 flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by combo name..."
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
                <TableHead>Combo Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCombos.map((combo) => (
                <TableRow key={combo.id}>
                  <TableCell className="font-medium">{combo.comboName}</TableCell>
                  <TableCell>{combo.brandName}</TableCell>
                  <TableCell>{formatDate(combo.startDate)}</TableCell>
                  <TableCell>{formatDate(combo.endDate)}</TableCell>
                  <TableCell>kr.{combo.pickupPrice?.toFixed(2) ?? 'N/A'}</TableCell>
                   <TableCell>
                    <Badge variant={combo.isActive ? 'default' : 'secondary'}>
                      {combo.isActive ? 'Active' : 'Inactive'}
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
                            <Link href={`/superadmin/combos/edit/${combo.id}`}><Eye className="mr-2 h-4 w-4" /> View Details</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/superadmin/combos/edit/${combo.id}`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => confirmDelete(combo.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredCombos.length === 0 && (
                <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No combos found.
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
                    This action cannot be undone. This will permanently delete this combo.
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
