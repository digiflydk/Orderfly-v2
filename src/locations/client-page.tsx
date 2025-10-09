
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Search, X } from "lucide-react";
import type { Location, Brand } from '@/types';
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
import { deleteLocation } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type LocationWithBrandName = Location & { brandName: string };

interface LocationsClientPageProps {
    initialLocations: LocationWithBrandName[];
    brands: Brand[];
}

export function LocationsClientPage({ initialLocations, brands }: LocationsClientPageProps) {
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');

  const filteredLocations = useMemo(() => {
    return initialLocations.filter(location => {
      const searchMatch = searchQuery === '' || 
        location.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        location.address.toLowerCase().includes(searchQuery.toLowerCase());
      
      const brandMatch = brandFilter === 'all' || location.brandId === brandFilter;

      return searchMatch && brandMatch;
    });
  }, [initialLocations, searchQuery, brandFilter]);

  const confirmDelete = (location: Location) => {
    setLocationToDelete(location);
    setIsAlertOpen(true);
  }
  
  const handleDelete = async () => {
    if (!locationToDelete) return;
    const result = await deleteLocation(locationToDelete.id, locationToDelete.brandId);
    if(result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
    }
    setIsAlertOpen(false);
    setLocationToDelete(null);
  }

  const clearFilters = () => {
    setSearchQuery('');
    setBrandFilter('all');
  }

  const isFiltered = searchQuery !== '' || brandFilter !== 'all';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Global Location Management</h1>
          <p className="text-muted-foreground">
            Create, view, and manage all store locations across all brands.
          </p>
        </div>
        <Button asChild>
            <Link href="/superadmin/locations/new">
                <PlusCircle className="mr-2" />
                Add New Location
            </Link>
        </Button>
      </div>

       <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by location name or address..."
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
        {isFiltered && (
            <Button variant="ghost" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" /> Clear
            </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLocations.map((location) => (
                <TableRow key={location.id}>
                  <TableCell className="font-medium">{location.name}</TableCell>
                  <TableCell>{location.brandName}</TableCell>
                  <TableCell>{location.address}</TableCell>
                   <TableCell>
                    <Badge variant={location.isActive ? 'default' : 'secondary'}>
                      {location.isActive ? 'Active' : 'Inactive'}
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
                          <Link href={`/superadmin/locations/edit/${location.id}`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => confirmDelete(location)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredLocations.length === 0 && (
                <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No locations found.
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete this location.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
