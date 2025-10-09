'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import type { FoodCategory } from '@/types';
import { FoodCategoryForm } from '@/components/superadmin/food-category-form';
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
import { deleteFoodCategory } from './actions';
import { useToast } from '@/hooks/use-toast';

interface FoodCategoriesClientPageProps {
    initialCategories: FoodCategory[];
}

export function FoodCategoriesClientPage({ initialCategories }: FoodCategoriesClientPageProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<FoodCategory | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const handleEdit = (category: FoodCategory) => {
    setSelectedCategory(category);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedCategory(null);
    setIsFormOpen(true);
  };

  const confirmDelete = (categoryId: string) => {
    setCategoryToDelete(categoryId);
    setIsAlertOpen(true);
  }
  
  const handleDelete = async () => {
    if (!categoryToDelete) return;
    const result = await deleteFoodCategory(categoryToDelete);
    if(result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
    }
    setIsAlertOpen(false);
    setCategoryToDelete(null);
  }

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Food Category Management</h1>
          <p className="text-muted-foreground">
            Manage the global list of food categories to classify brands (e.g., Pizzeria, Thai).
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <PlusCircle className="mr-2" />
          Add New Category
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialCategories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>{category.description}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(category)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => confirmDelete(category.id)} className="text-destructive">
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
                    This action cannot be undone. This will permanently delete this food category.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
      </AlertDialog>

      <FoodCategoryForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        category={selectedCategory}
      />
    </>
  );
}
