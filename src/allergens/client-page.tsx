
'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import type { Allergen } from '@/types';
import Link from 'next/link';
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
import { deleteAllergen } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { DynamicIcon } from '@/components/superadmin/dynamic-icon';

interface AllergensClientPageProps {
    initialAllergens: Allergen[];
}

export function AllergensClientPage({ initialAllergens }: AllergensClientPageProps) {
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [allergenToDelete, setAllergenToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const confirmDelete = (allergenId: string) => {
    setAllergenToDelete(allergenId);
    setIsAlertOpen(true);
  }
  
  const handleDelete = async () => {
    if (!allergenToDelete) return;
    const result = await deleteAllergen(allergenToDelete);
    if(result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
    }
    setIsAlertOpen(false);
    setAllergenToDelete(null);
  }

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Allergen Management</h1>
          <p className="text-muted-foreground">
            Manage the global list of allergens available to all brands.
          </p>
        </div>
        <Button asChild>
          <Link href="/superadmin/allergens/new">
            <PlusCircle className="mr-2" />
            Add New Allergen
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Icon</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialAllergens.map((allergen) => (
                <TableRow key={allergen.id}>
                  <TableCell>
                    {allergen.icon && <DynamicIcon name={allergen.icon} className="h-5 w-5" />}
                  </TableCell>
                  <TableCell className="font-medium">{allergen.allergenName}</TableCell>
                   <TableCell>
                    <Badge variant={allergen.isActive ? 'default' : 'secondary'}>
                      {allergen.isActive ? 'Active' : 'Inactive'}
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
                           <Link href={`/superadmin/allergens/edit/${allergen.id}`}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                           </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => confirmDelete(allergen.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the allergen.
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
