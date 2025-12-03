

'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Search, X, GripVertical } from "lucide-react";
import type { Category, Location, Brand } from '@/types';
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { deleteCategory, updateCategorySortOrder } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DynamicIcon } from '@/components/superadmin/dynamic-icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type CategoryWithDetails = Category & { locationNames: string, brandId?: string, brandName?: string };

interface CategoriesClientPageProps {
    initialCategories: CategoryWithDetails[];
    locations: Location[];
    brands: Brand[];
}


function SortableCategoryRow({ category, onConfirmDelete }: { category: CategoryWithDetails, onConfirmDelete: (id: string) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: category.id });
    
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <TableRow ref={setNodeRef} style={style} {...attributes}>
             <TableCell className="w-12 pl-4">
                <button {...listeners} className="p-2 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-5 w-5 text-muted-foreground" />
                </button>
            </TableCell>
            <TableCell>
                {category.icon && <DynamicIcon name={category.icon} className="h-5 w-5" />}
            </TableCell>
            <TableCell className="font-medium">{category.categoryName}</TableCell>
            <TableCell>{category.brandName}</TableCell>
            <TableCell>{category.locationNames}</TableCell>
            <TableCell>{category.sortOrder}</TableCell>
            <TableCell>
                <Badge variant={category.isActive ? 'default' : 'secondary'}>
                    {category.isActive ? 'Active' : 'Inactive'}
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
                        <Link href={`/superadmin/categories/edit/${category.id}`}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onConfirmDelete(category.id); }} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                    </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </TableCell>
        </TableRow>
    );
}


export function CategoriesClientPage({ initialCategories, locations, brands }: CategoriesClientPageProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [isPending, startTransition] = useTransition();
  const [isClient, setIsClient] = useState(false);
  
  const [orderedCategories, setOrderedCategories] = useState(initialCategories);
  
  useEffect(() => {
    setIsClient(true);
    setOrderedCategories(initialCategories);
  }, [initialCategories]);
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );


  const filteredCategories = useMemo(() => {
    return orderedCategories.filter(category => {
      const searchMatch = searchQuery === '' || 
        category.categoryName.toLowerCase().includes(searchQuery.toLowerCase());
      
      const brandMatch = brandFilter === 'all' || category.brandId === brandFilter;
      
      return searchMatch && brandMatch;
    });
  }, [orderedCategories, searchQuery, brandFilter]);

  const handleDelete = async (categoryId: string) => {
    const result = await deleteCategory(categoryId);
    if(result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
        router.refresh();
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const {active, over} = event;

    if (over && active.id !== over.id) {
        const originalItems = [...orderedCategories];
        const oldIndex = orderedCategories.findIndex((item) => item.id === active.id);
        const newIndex = orderedCategories.findIndex((item) => item.id === over.id);
        const newOrder = arrayMove(orderedCategories, oldIndex, newIndex);
        setOrderedCategories(newOrder);
        
        startTransition(async () => {
            const result = await updateCategorySortOrder(newOrder.map((p, index) => ({id: p.id, sortOrder: index})));
            if (result.error) {
                toast({variant: 'destructive', title: 'Update Failed', description: result.message});
                setOrderedCategories(originalItems); 
            } else {
                toast({title: 'Success!', description: result.message});
                const updatedCategoriesWithOrder = newOrder.map((p, index) => ({...p, sortOrder: index}));
                setOrderedCategories(updatedCategoriesWithOrder);
            }
        });
    }
  }

  const clearFilters = () => {
    setSearchQuery('');
    setBrandFilter('all');
  }

  const isFiltered = searchQuery !== '' || brandFilter !== 'all';

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Category Management</h1>
          <p className="text-muted-foreground">
            Manage product categories for all locations.
          </p>
        </div>
        <Button asChild>
            <Link href="/superadmin/categories/new">
                <PlusCircle className="mr-2" />
                Add New Category
            </Link>
        </Button>
      </div>

       <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by category name..."
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead className="w-[60px]"></TableHead>
                    <TableHead>Icon</TableHead>
                    <TableHead>Category Name</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Locations</TableHead>
                    <TableHead>Sort</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
                </TableHeader>
                {isClient ? (
                    <SortableContext items={filteredCategories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        <TableBody>
                            {filteredCategories.map((category) => (
                                <SortableCategoryRow key={category.id} category={category} onConfirmDelete={handleDelete}/>
                            ))}
                            {filteredCategories.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                        No categories found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </SortableContext>
                ) : (
                    <TableBody>
                        {initialCategories.map(category => (
                            <TableRow key={category.id}>
                                <TableCell><GripVertical className="h-5 w-5 text-muted-foreground" /></TableCell>
                                <TableCell>{category.icon && <DynamicIcon name={category.icon} className="h-5 w-5" />}</TableCell>
                                <TableCell className="font-medium">{category.categoryName}</TableCell>
                                <TableCell>{category.brandName}</TableCell>
                                <TableCell>{category.locationNames}</TableCell>
                                <TableCell>{category.sortOrder}</TableCell>
                                <TableCell><Badge variant={category.isActive ? 'default' : 'secondary'}>{category.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                                <TableCell className="text-right">...</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                )}
            </Table>
           </DndContext>
        </CardContent>
      </Card>
      
        {initialCategories.map(category => (
            <AlertDialog key={`alert-${category.id}`}>
                <AlertDialogTrigger asChild>
                    <Button id={`delete-btn-${category.id}`} className="hidden">Delete Trigger</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete this category.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(category.id)}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        ))}
    </>
  );
}
