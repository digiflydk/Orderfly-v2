

'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { Topping, ToppingGroup, Location } from '@/types';
import { createOrUpdateTopping } from '@/app/superadmin/toppings/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../ui/card';
import { Switch } from '../ui/switch';
import { ScrollArea } from '../ui/scroll-area';

const toppingSchema = z.object({
  id: z.string().optional(),
  locationIds: z.array(z.string()).min(1, { message: 'At least one location must be selected.' }),
  groupId: z.string().min(1, { message: 'A topping group must be selected.' }),
  toppingName: z.string().min(2, { message: 'Topping name must be at least 2 characters.' }),
  price: z.coerce.number().min(0, { message: 'Price must be a non-negative number.' }),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.coerce.number().optional(),
});

type ToppingFormValues = z.infer<typeof toppingSchema>;

interface ToppingFormPageProps {
  topping?: Topping | null;
  locations: Location[];
  allGroups: ToppingGroup[];
  brands: any[];
}

export function ToppingFormPage({ topping, locations, allGroups, brands }: ToppingFormPageProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<ToppingFormValues>({
    resolver: zodResolver(toppingSchema),
    defaultValues: {
      locationIds: [],
      groupId: '',
      toppingName: '',
      price: undefined,
      isActive: true,
      isDefault: false,
      sortOrder: undefined,
    },
  });

  const selectedLocationIds = form.watch('locationIds');

  const availableGroups = useMemo(() => {
    if (!selectedLocationIds || selectedLocationIds.length === 0) return [];
    const selectedLocationSet = new Set(selectedLocationIds);
    return allGroups.filter(g => g.locationIds.some(locId => selectedLocationSet.has(locId)));
  }, [selectedLocationIds, allGroups]);
  
  useEffect(() => {
    if (topping) {
      form.reset({
        ...topping,
        locationIds: topping.locationIds || [],
        isDefault: topping.isDefault || false,
        sortOrder: topping.sortOrder || undefined,
      });
    } else {
      form.reset({
        locationIds: [],
        groupId: '',
        toppingName: '',
        price: undefined,
        isActive: true,
        isDefault: false,
        sortOrder: undefined,
      });
    }
  }, [topping, form]);

  useEffect(() => {
    const currentGroupId = form.getValues('groupId');
    if (currentGroupId && !availableGroups.some(g => g.id === currentGroupId)) {
        form.setValue('groupId', '');
    }
  }, [selectedLocationIds, form, availableGroups]);

  const onSubmit = (data: ToppingFormValues) => {
    const formData = new FormData();

    if (topping?.id) {
        formData.append('id', topping.id);
    }
    
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key === 'isActive' || key === 'isDefault') {
          if (value) formData.append(key, 'on');
        } else if (Array.isArray(value)) {
          value.forEach(item => formData.append(key, String(item)));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    startTransition(async () => {
        const result = await createOrUpdateTopping(null, formData);
        if (result.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success!', description: result.message });
        }
    });
  }

  const title = topping ? 'Edit Topping' : 'Create New Topping';
  const description = topping ? `Editing details for ${topping.toppingName}.` : 'Fill in the details for the new topping.';

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-muted-foreground">{description}</p>
            </div>
             <div className="flex gap-2">
                <Button variant="outline" asChild>
                    <Link href="/superadmin/toppings">Cancel</Link>
                </Button>
                <Button onClick={form.handleSubmit(onSubmit)} disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : (topping ? 'Save Changes' : 'Create Topping')}</Button>
            </div>
        </div>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <FormField control={form.control} name="toppingName" render={({ field }) => (
                        <FormItem><FormLabel>Topping Name</FormLabel><FormControl><Input placeholder="e.g., Extra Cheese" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        
                        <FormField
                        control={form.control} name="groupId" render={({ field }) => (
                            <FormItem>
                            <FormLabel>Topping Group</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={!selectedLocationIds || selectedLocationIds.length === 0}>
                                <FormControl><SelectTrigger><SelectValue placeholder={(!selectedLocationIds || selectedLocationIds.length === 0) ? "Select locations first" : "Select a group"} /></SelectTrigger></FormControl>
                                <SelectContent>{availableGroups.map((group) => (<SelectItem key={group.id} value={group.id}>{group.groupName}</SelectItem>))}</SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        
                        <FormField
                        control={form.control}
                        name="locationIds"
                        render={() => (
                            <FormItem>
                            <FormLabel>Available at Locations</FormLabel>
                            <ScrollArea className="h-32 rounded-md border">
                                <div className="p-4 space-y-2">
                                {locations.map((item) => (
                                    <FormField
                                    key={item.id}
                                    control={form.control}
                                    name="locationIds"
                                    render={({ field }) => {
                                        return (
                                        <FormItem
                                            key={item.id}
                                            className="flex flex-row items-start space-x-3 space-y-0"
                                        >
                                            <FormControl>
                                            <Checkbox
                                                checked={field.value?.includes(item.id)}
                                                onCheckedChange={(checked) => {
                                                const currentValue = field.value || [];
                                                const newValue = checked
                                                    ? [...currentValue, item.id]
                                                    : currentValue.filter((value) => value !== item.id);
                                                field.onChange(newValue);
                                                }}
                                            />
                                            </FormControl>
                                            <FormLabel className="font-normal cursor-pointer">
                                            {item.name}
                                            </FormLabel>
                                        </FormItem>
                                        )
                                    }}
                                    />
                                ))}
                                </div>
                            </ScrollArea>
                            <FormMessage />
                            </FormItem>
                        )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="price" render={({ field }) => (
                                <FormItem><FormLabel>Price (kr.)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="sortOrder" render={({ field }) => (
                                <FormItem><FormLabel>Sort Order</FormLabel><FormControl><Input type="number" placeholder="1" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )}/>
                        </div>

                         <div className="space-y-2">
                            <FormField
                                control={form.control}
                                name="isActive"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel>Active</FormLabel>
                                            <FormDescription>Is this topping currently available?</FormDescription>
                                        </div>
                                        <FormControl><Switch name="isActive" checked={field.value} onCheckedChange={field.onChange}/></FormControl>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="isDefault"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel>Select as Default</FormLabel>
                                            <FormDescription>Is this topping selected by default?</FormDescription>
                                        </div>
                                        <FormControl><Switch name="isDefault" checked={field.value} onCheckedChange={field.onChange}/></FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>
                    </CardContent>
                </Card>
            </form>
        </Form>
    </div>
  );
}
