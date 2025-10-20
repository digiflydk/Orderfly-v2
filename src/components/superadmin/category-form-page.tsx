

'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { Category, Brand, Location } from '@/types';
import { createOrUpdateCategory } from '@/app/superadmin/categories/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { ScrollArea } from '../ui/scroll-area';
import { icons } from 'lucide-react';
import { Separator } from '../ui/separator';

const categorySchema = z.object({
  id: z.string().optional(),
  brandId: z.string().min(1, 'A primary brand must be selected.'),
  locationIds: z.array(z.string()).min(1, { message: 'At least one location must be selected.' }),
  categoryName: z.string().min(2, { message: 'Category name must be at least 2 characters.' }),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().optional(),
  icon: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface CategoryFormPageProps {
  category?: Category;
  brands: Brand[];
  locations: Location[];
}

export function CategoryFormPage({ category, brands, locations }: CategoryFormPageProps) {
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    
    const form = useForm<CategoryFormValues>({
        resolver: zodResolver(categorySchema),
        defaultValues: category || {
            brandId: '',
            locationIds: [],
            categoryName: '',
            description: '',
            isActive: true,
            icon: '',
        },
    });

    const { control, watch, setValue } = form;

    const locationsByBrand = useMemo(() => {
      return brands.map(brand => ({
        ...brand,
        locations: locations.filter(loc => loc.brandId === brand.id)
      })).filter(brand => brand.locations.length > 0);
    }, [brands, locations]);

    useEffect(() => {
        if (category) {
            form.reset(category);
        }
    }, [category, form]);

    const title = category ? 'Edit Category' : 'Create New Category';
    const description = category ? `Editing details for ${category.categoryName}.` : 'Fill in the details for the new category.';

    const onSubmit = (data: CategoryFormValues) => {
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                if (key === 'isActive') {
                    if (value) formData.append(key, 'on');
                } else if (Array.isArray(value)) {
                    value.forEach(item => formData.append(key, String(item)));
                } else {
                    formData.append(key, String(value));
                }
            }
        });

        startTransition(async () => {
            const result = await createOrUpdateCategory(null, formData);
            if (result?.error) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            } else {
                toast({ title: 'Success!', description: `Category ${category ? 'updated' : 'created'}.` });
            }
        });
    };

    const iconList = Object.keys(icons);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-muted-foreground">{description}</p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" asChild>
                    <Link href="/superadmin/categories">Cancel</Link>
                </Button>
                <Button type="submit" disabled={isPending}>
                    {isPending ? <Loader2 className="animate-spin" /> : (category ? 'Save Changes' : 'Create Category')}
                </Button>
            </div>
        </div>
        <Card>
            <CardContent className="pt-6 space-y-4">
                <FormField
                    control={control}
                    name="categoryName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Category Name</FormLabel>
                            <FormControl><Input placeholder="e.g., Pizza, Salads, Drinks" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description (Optional)</FormLabel>
                            <FormControl><Textarea placeholder="A short description of the category." {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={control}
                    name="icon"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Icon (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ''}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select an icon" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {iconList.map(iconName => (
                                        <SelectItem key={iconName} value={iconName}>{iconName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                             <FormDescription>Select an icon to display next to the category name.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                
                <Separator />
                
                 <FormField
                    control={control}
                    name="brandId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Primary Brand</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select the main brand for this category" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {brands.map(brand => (
                                        <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormDescription>This helps with filtering and organization, but you can still select locations from other brands.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={control}
                    name="locationIds"
                    render={() => (
                        <FormItem>
                            <FormLabel>Available at Locations</FormLabel>
                            <ScrollArea className="h-60 rounded-md border">
                                <div className="p-4">
                                {locationsByBrand.map((brand) => (
                                    <div key={brand.id} className="mb-4">
                                        <h4 className="font-semibold text-sm mb-2">{brand.name}</h4>
                                        <div className="pl-4 space-y-2">
                                            {brand.locations.map(item => (
                                                <FormField
                                                    key={item.id}
                                                    control={control}
                                                    name="locationIds"
                                                    render={({ field: locationField }) => (
                                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                                        <FormControl>
                                                        <Checkbox
                                                            checked={locationField.value?.includes(item.id)}
                                                            onCheckedChange={(checked) => {
                                                                const currentValue = locationField.value || [];
                                                                return checked ? locationField.onChange([...currentValue, item.id]) : locationField.onChange(currentValue?.filter((value) => value !== item.id))
                                                            }}
                                                        />
                                                        </FormControl>
                                                        <FormLabel className="font-normal">{item.name}</FormLabel>
                                                    </FormItem>
                                                    )}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                </div>
                            </ScrollArea>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={control}
                    name="isActive"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <FormLabel>Active</FormLabel>
                                <FormDescription>Is this category currently visible on the menu?</FormDescription>
                            </div>
                            <FormControl>
                                <Switch
                                    name="isActive"
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />
            </CardContent>
        </Card>
      </form>
    </Form>
  );
}
