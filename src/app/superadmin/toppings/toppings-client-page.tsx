
'use client';

import { useState, useMemo, useEffect, useTransition } from 'react';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Search, X, GripVertical, ChevronDown } from "lucide-react";
import type { Topping, ToppingGroup, Location, Brand } from '@/types';
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
import { deleteTopping, deleteToppingGroup, updateToppingSortOrder } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ToppingFormPage } from '@/components/superadmin/topping-form-page';


function SortableToppingItem({ topping, onConfirmDelete }: { topping: Topping, onConfirmDelete: (toppingId: string) => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({id: topping.id});

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };
    
    return (
        <TableRow ref={setNodeRef} style={style} {...attributes}>
             <TableCell className="w-12 pl-4">
                <button {...listeners} className="p-2 text-muted-foreground hover:bg-accent rounded-md cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-5 w-5" />
                </button>
            </TableCell>
            <TableCell className="font-medium">{topping.toppingName}</TableCell>
            <TableCell>kr.{topping.price.toFixed(2)}</TableCell>
            <TableCell>
                <Badge variant={topping.isActive ? 'default' : 'secondary'}>{topping.isActive ? 'Active' : 'Inactive'}</Badge>
            </TableCell>
             <TableCell className="text-right pr-4">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                           <Link href={`/superadmin/toppings/edit-topping/${topping.id}`}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Topping
                           </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onConfirmDelete(topping.id) }} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Topping
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
             </TableCell>
        </TableRow>
    );
}

interface ToppingsClientPageProps {
    initialToppingGroups: ToppingGroup[];
    initialToppings: Topping[];
    initialLocations: Location[];
    initialBrands: Brand[];
}

export function ToppingsClientPage({ 
    initialToppingGroups, 
    initialToppings, 
    initialLocations, 
    initialBrands 
}: ToppingsClientPageProps) {
  const { toast } = useToast();
  
  const [isGroupAlertOpen, setIsGroupAlertOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);

  const [isToppingAlertOpen, setIsToppingAlertOpen] = useState(false);
  const [toppingToDelete, setToppingToDelete] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');

  const [isPending, startTransition] = useTransition();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const [activeGroups, setActiveGroups] = useState<ToppingGroup[]>(initialToppingGroups || []);
  const [activeToppings, setActiveToppings] = useState<Topping[]>(initialToppings || []);
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { groupsWithDetails } = useMemo(() => {
    if (!initialLocations || !initialBrands) {
        return { groupsWithDetails: [] };
    }

    const locationMap = new Map(initialLocations.map(l => [l.id, { name: l.name, brandId: l.brandId }]));
    const brandMap = new Map(initialBrands.map(b => [b.id, b.name]));

    const getBrandInfo = (locationIds: string[]): { brandId?: string; brandName?: string } => {
        if (!locationIds || locationIds.length === 0) return {};
        const firstLocationId = locationIds[0];
        const location = locationMap.get(firstLocationId);
        if (!location) return {};
        
        const brandId = location.brandId;
        const brandName = brandMap.get(brandId);
        return { brandId, brandName };
    };

    const groupsWithDetailsData: (ToppingGroup & { brandId?: string, brandName?: string })[] = activeGroups.map(group => ({
        ...group,
        ...getBrandInfo(group.locationIds),
    }));
    
    return { groupsWithDetails: groupsWithDetailsData };

  }, [activeGroups, initialLocations, initialBrands]);

  const filteredGroups = useMemo(() => {
    return groupsWithDetails.filter(group => {
      const searchMatch = searchQuery === '' || group.groupName.toLowerCase().includes(searchQuery.toLowerCase());
      const brandMatch = brandFilter === 'all' || group.brandId === brandFilter;
      return searchMatch && brandMatch;
    });
  }, [groupsWithDetails, searchQuery, brandFilter]);

  const toppingsByGroup = useMemo(() => {
    return activeToppings.reduce((acc, topping) => {
        if (!acc[topping.groupId]) {
            acc[topping.groupId] = [];
        }
        acc[topping.groupId].push(topping);
        return acc;
    }, {} as Record<string, Topping[]>);
  }, [activeToppings]);
  

  const confirmDeleteGroup = (groupId: string) => {
    setGroupToDelete(groupId);
    setIsGroupAlertOpen(true);
  }
  
  const handleDeleteGroup = async () => {
    if (!groupToDelete) return;
    const result = await deleteToppingGroup(groupToDelete);
    if (result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
        const deletedGroupId = groupToDelete;
        setActiveGroups(prev => prev.filter(g => g.id !== deletedGroupId));
        setActiveToppings(prev => prev.filter(t => t.groupId !== deletedGroupId));
    }
    setIsGroupAlertOpen(false);
    setGroupToDelete(null);
  }
  
  const confirmDeleteTopping = (toppingId: string) => {
    setToppingToDelete(toppingId);
    setIsToppingAlertOpen(true);
  };

  const handleDeleteTopping = async () => {
    if (!toppingToDelete) return;
    const result = await deleteTopping(toppingToDelete);
    if(result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
        const deletedToppingId = toppingToDelete;
        setActiveToppings(prev => prev.filter(t => t.id !== deletedToppingId));
    }
    setIsToppingAlertOpen(false);
    setToppingToDelete(null);
  }
  
  const clearFilters = () => {
    setSearchQuery('');
    setBrandFilter('all');
  }
  
  function handleDragEnd(event: DragEndEvent) {
    const {active, over} = event;

    if (over && active.id !== over.id) {
      const activeGroupId = activeToppings.find(t => t.id === active.id)?.groupId;
      const overGroupId = activeToppings.find(t => t.id === over.id)?.groupId;

      if(activeGroupId !== overGroupId || !activeGroupId) {
        toast({variant: 'destructive', title: 'Error', description: 'Toppings can only be reordered within the same group.'});
        return;
      }
      
      const groupToppings = toppingsByGroup[activeGroupId].sort((a,b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
      const oldIndex = groupToppings.findIndex((t) => t.id === active.id);
      const newIndex = groupToppings.findIndex((t) => t.id === over!.id);
      
      const newOrderedToppingsForGroup = arrayMove(groupToppings, oldIndex, newIndex);
      
      const originalToppings = [...activeToppings];
      const newActiveToppings = [
        ...activeToppings.filter(t => t.groupId !== activeGroupId),
        ...newOrderedToppingsForGroup
      ];
      setActiveToppings(newActiveToppings);

      startTransition(async () => {
        const result = await updateToppingSortOrder(newOrderedToppingsForGroup.map((t, index) => ({id: t.id, sortOrder: index})));
        if(result.error) {
            toast({variant: 'destructive', title: 'Update Failed', description: result.message});
            setActiveToppings(originalToppings);
        } else {
            toast({title: 'Success!', description: result.message});
            const updatedToppingsWithOrder = newActiveToppings.map(t => {
                const newSortIndex = newOrderedToppingsForGroup.findIndex(nt => nt.id === t.id);
                if(t.groupId === activeGroupId && newSortIndex !== -1) {
                    return {...t, sortOrder: newSortIndex };
                }
                return t;
            })
            setActiveToppings(updatedToppingsWithOrder);
        }
      });
    }
  }

  const isFiltered = searchQuery !== '' || brandFilter !== 'all';

  return (
    <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Toppings Management</h1>
                <p className="text-muted-foreground">
                Manage topping groups and individual topping options.
                </p>
            </div>
             <div className="flex items-center gap-2 self-end sm:self-center">
                <Button asChild size="sm">
                    <Link href="/superadmin/toppings/new-group">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Group
                    </Link>
                </Button>
                <Button asChild size="sm">
                     <Link href="/superadmin/toppings/new-topping">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Topping
                    </Link>
                </Button>
            </div>
        </div>
      
       <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by group or topping name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
         <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by brand..." />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {(initialBrands || []).map(brand => (
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
      </div>

        <div className="space-y-4">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <div className="space-y-4">
                    {filteredGroups.map(group => (
                        <Card key={group.id}>
                            <Collapsible defaultOpen>
                                <CardHeader className="flex flex-row items-center justify-between p-4">
                                    <div className="flex-1">
                                        <CollapsibleTrigger asChild>
                                             <div className="flex items-center gap-2 group cursor-pointer">
                                                <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                                <div className="flex flex-col">
                                                    <CardTitle className="text-lg">{group.groupName}</CardTitle>
                                                    <CardDescription className="text-xs">
                                                        Min: {group.minSelection}, Max: {group.maxSelection === 0 ? 'Unlimited' : group.maxSelection}
                                                        <Badge variant="outline" className="ml-2">{group.brandName}</Badge>
                                                    </CardDescription>
                                                </div>
                                            </div>
                                        </CollapsibleTrigger>
                                     </div>
                                     <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="icon" asChild>
                                            <Link href={`/superadmin/toppings/edit-group/${group.id}`}>
                                                <Edit className="h-4 w-4" />
                                            </Link>
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => confirmDeleteGroup(group.id)} className="text-destructive">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                     </div>
                                </CardHeader>
                                <CollapsibleContent>
                                    <CardContent className="p-0 border-t">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[60px]"></TableHead>
                                                    <TableHead>Topping</TableHead>
                                                    <TableHead>Price</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            {isClient ? (
                                                <SortableContext items={(toppingsByGroup[group.id] || []).map(t => t.id)} strategy={verticalListSortingStrategy}>
                                                    <TableBody>
                                                        {(toppingsByGroup[group.id] || []).sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)).map(topping => (
                                                            <SortableToppingItem 
                                                                key={topping.id} 
                                                                topping={topping}
                                                                onConfirmDelete={confirmDeleteTopping}
                                                            />
                                                        ))}
                                                    </TableBody>
                                                </SortableContext>
                                            ) : (
                                                <TableBody>
                                                    {(toppingsByGroup[group.id] || []).sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)).map(topping => (
                                                        <TableRow key={topping.id}>
                                                            <TableCell><GripVertical className="h-5 w-5 text-muted-foreground" /></TableCell>
                                                            <TableCell className="font-medium">{topping.toppingName}</TableCell>
                                                            <TableCell>kr.{topping.price.toFixed(2)}</TableCell>
                                                            <TableCell><Badge variant={topping.isActive ? 'default' : 'secondary'}>{topping.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                                                            <TableCell className="text-right pr-4">...</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            )}
                                        </Table>
                                         {(toppingsByGroup[group.id] || []).length === 0 && (
                                            <p className="text-center text-muted-foreground py-4 text-sm">No toppings in this group yet.</p>
                                        )}
                                    </CardContent>
                                </CollapsibleContent>
                            </Collapsible>
                        </Card>
                    ))}
                </div>
            </DndContext>
             {filteredGroups.length === 0 && (
                <div className="text-center text-muted-foreground py-10">
                    <p>No topping groups match your filters.</p>
                </div>
            )}
        </div>
      
      <AlertDialog open={isGroupAlertOpen} onOpenChange={setIsGroupAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the topping group and all toppings within it. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteGroup}>Continue</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isToppingAlertOpen} onOpenChange={setIsToppingAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action will permanently delete the topping.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setToppingToDelete(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteTopping}>Continue</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
