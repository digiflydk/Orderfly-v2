

'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
import { PlusCircle, MoreHorizontal, Edit, Trash2, Search, X, GripVertical, Copy } from "lucide-react";
import type { Product, Brand, Category, Location } from '@/types';
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
} from "@/components/ui/alert-dialog";
import { deleteProduct, updateProductSortOrder } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { ProductDuplicationDialog } from '@/components/superadmin/product-duplication-dialog';
import { getAllLocations } from '@/app/superadmin/locations/actions';

type ProductWithDetails = Product & { brandName: string, categoryName: string };

interface ProductsClientPageProps {
    initialProducts: ProductWithDetails[];
    brands: Brand[];
}

function SortableProductRow({ product, selected, onSelectChange }: { product: ProductWithDetails, selected: boolean, onSelectChange: (checked: boolean) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: product.id });
    
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const confirmDelete = () => {
        const button = document.getElementById(`delete-btn-${product.id}`);
        button?.click();
    };

    const handleDuplicate = () => {
        const button = document.getElementById(`duplicate-btn-${product.id}`);
        button?.click();
    }

    return (
        <TableRow ref={setNodeRef} style={style} {...attributes} data-state={selected ? 'selected' : undefined}>
            <TableCell className="w-12 pl-4">
                <div {...listeners} className="p-2 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-5 w-5 text-muted-foreground" />
                </div>
            </TableCell>
             <TableCell className="w-12">
                <Checkbox
                    checked={selected}
                    onCheckedChange={onSelectChange}
                    aria-label="Select product"
                />
            </TableCell>
            <TableCell>
                <Image 
                    src={product.imageUrl || 'https://placehold.co/64x64.png'} 
                    alt={product.productName}
                    width={48}
                    height={48}
                    className="rounded-md object-cover"
                    data-ai-hint="delicious food"
                />
            </TableCell>
            <TableCell className="font-medium">{product.productName}</TableCell>
            <TableCell>{product.brandName}</TableCell>
            <TableCell>{product.categoryName}</TableCell>
            <TableCell>kr.{product.price.toFixed(2)}</TableCell>
            <TableCell>{product.sortOrder}</TableCell>
            <TableCell>
                <Badge variant={product.isActive ? 'default' : 'secondary'}>
                {product.isActive ? 'Active' : 'Inactive'}
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
                        <Link href={`/superadmin/products/edit/${product.id}`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                        </Link>
                    </DropdownMenuItem>
                     <DropdownMenuItem onSelect={handleDuplicate}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={confirmDelete} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
                </DropdownMenu>
            </TableCell>
        </TableRow>
    );
}

export function ProductsClientPage({ initialProducts, brands }: ProductsClientPageProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [isPending, startTransition] = useTransition();
  const [isClient, setIsClient] = useState(false);
  
  const [orderedProducts, setOrderedProducts] = useState(initialProducts);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isDuplicationDialogOpen, setIsDuplicationDialogOpen] = useState(false);
  const [allLocations, setAllLocations] = useState<Location[]>([]);

  useEffect(() => {
    setIsClient(true);
    setOrderedProducts(initialProducts);
    getAllLocations().then(setAllLocations);
  }, [initialProducts]);


  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredProducts = useMemo(() => {
    return orderedProducts.filter(product => {
      const searchMatch = searchQuery === '' || 
        product.productName.toLowerCase().includes(searchQuery.toLowerCase());
      
      const brandMatch = brandFilter === 'all' || product.brandId === brandFilter;

      return searchMatch && brandMatch;
    });
  }, [orderedProducts, searchQuery, brandFilter]);

  const handleDelete = async (productId: string) => {
    const result = await deleteProduct(productId);
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
        const originalItems = [...orderedProducts];
        const oldIndex = orderedProducts.findIndex((item) => item.id === active.id);
        const newIndex = orderedProducts.findIndex((item) => item.id === over.id);
        const newOrder = arrayMove(orderedProducts, oldIndex, newIndex);
        setOrderedProducts(newOrder);
        
        startTransition(async () => {
            const result = await updateProductSortOrder(newOrder.map((p, index) => ({id: p.id, sortOrder: index})));
            if (result.error) {
                toast({variant: 'destructive', title: 'Update Failed', description: result.message});
                setOrderedProducts(originalItems); 
            } else {
                toast({title: 'Success!', description: result.message});
                const updatedProductsWithOrder = newOrder.map((p, index) => ({...p, sortOrder: index}));
                setOrderedProducts(updatedProductsWithOrder);
            }
        });
    }
  }

  const clearFilters = () => {
    setSearchQuery('');
    setBrandFilter('all');
  }

  const isFiltered = searchQuery !== '' || brandFilter !== 'all';
  
  const handleSelectAll = (checked: boolean) => {
      setSelectedProductIds(checked ? filteredProducts.map(p => p.id) : []);
  }

  const handleOpenDuplicateDialog = (productId?: string) => {
    if (productId) {
      setSelectedProductIds([productId]);
    }
    if (selectedProductIds.length > 0 || productId) {
      setIsDuplicationDialogOpen(true);
    } else {
        toast({
            variant: "destructive",
            title: "No Products Selected",
            description: "Please select at least one product to duplicate.",
        })
    }
  };
  
  const onDuplicationSuccess = () => {
      setSelectedProductIds([]);
      router.refresh();
  }


  return (
    <>
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                <h1 className="text-2xl font-bold tracking-tight">Product Management</h1>
                <p className="text-muted-foreground">
                    Create, view, and manage all products across all brands. Drag and drop to reorder.
                </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => handleOpenDuplicateDialog()} disabled={selectedProductIds.length === 0} variant="outline">
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate ({selectedProductIds.length})
                    </Button>
                    <Button asChild>
                        <Link href="/superadmin/products/new">
                            <PlusCircle className="mr-2" />
                            Add New Product
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by product name..."
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
                            <TableHead className="w-12">
                                <Checkbox
                                    checked={selectedProductIds.length > 0 && selectedProductIds.length === filteredProducts.length}
                                    onCheckedChange={handleSelectAll}
                                    aria-label="Select all"
                                />
                            </TableHead>
                            <TableHead className="w-[80px]">Image</TableHead>
                            <TableHead>Product Name</TableHead>
                            <TableHead>Brand</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Sort</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                        </TableHeader>
                        {isClient ? (
                            <SortableContext items={filteredProducts.map(p => p.id)} strategy={verticalListSortingStrategy}>
                                <TableBody>
                                {filteredProducts.map((product) => (
                                    <SortableProductRow 
                                      key={product.id} 
                                      product={product}
                                      selected={selectedProductIds.includes(product.id)}
                                      onSelectChange={(checked) => setSelectedProductIds(prev => checked ? [...prev, product.id] : prev.filter(id => id !== product.id))}
                                    />
                                ))}
                                {filteredProducts.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                                            No products found.
                                        </TableCell>
                                    </TableRow>
                                )}
                                </TableBody>
                            </SortableContext>
                        ) : (
                            <TableBody>
                                {initialProducts.map((product) => (
                                    <TableRow key={product.id}>
                                        <TableCell className="w-12 pl-4"><GripVertical className="h-5 w-5 text-muted-foreground" /></TableCell>
                                        <TableCell className="w-12"><Checkbox /></TableCell>
                                        <TableCell>
                                            <Image src={product.imageUrl || 'https://placehold.co/64x64.png'} alt={product.productName} width={48} height={48} className="rounded-md object-cover" data-ai-hint="delicious food"/>
                                        </TableCell>
                                        <TableCell className="font-medium">{product.productName}</TableCell>
                                        <TableCell>{product.brandName}</TableCell>
                                        <TableCell>{product.categoryName}</TableCell>
                                        <TableCell>kr.{product.price.toFixed(2)}</TableCell>
                                        <TableCell>{product.sortOrder}</TableCell>
                                        <TableCell><Badge variant={product.isActive ? 'default' : 'secondary'}>{product.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Open menu</span><MoreHorizontal className="h-4 w-4" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        )}
                    </Table>
                </DndContext>
                </CardContent>
            </Card>
            
            {initialProducts.map(product => (
                <div key={`actions-${product.id}`}>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <button id={`delete-btn-${product.id}`} className="hidden">Delete Trigger</button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete this product.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(product.id)}>Continue</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <button id={`duplicate-btn-${product.id}`} className="hidden" onClick={() => handleOpenDuplicateDialog(product.id)}>Duplicate Trigger</button>
                </div>
            ))}
        </div>
        <ProductDuplicationDialog
            isOpen={isDuplicationDialogOpen}
            setIsOpen={setIsDuplicationDialogOpen}
            productIds={selectedProductIds}
            brands={brands}
            locations={allLocations}
            onSuccess={onDuplicationSuccess}
        />
    </>
  );
}
