
'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, PlusCircle, Trash2, X, Clock } from 'lucide-react';

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { ComboMenu, Brand, Product, Location, Category, ProductForMenu } from '@/types';
import { createOrUpdateCombo, type FormState } from '@/app/superadmin/combos/actions';
import { getProductsForBrand, getCategoriesForBrand } from '@/app/superadmin/upsells/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '@/lib/utils';
import { Separator } from '../ui/separator';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';


const productGroupSchema = z.object({
  id: z.string(),
  groupName: z.string().min(1, "Group name is required."),
  productIds: z.array(z.string()).min(1, "Each group must have at least one product."),
  minSelection: z.coerce.number().min(0, "Min selection must be 0 or more."),
  maxSelection: z.coerce.number().min(0, "Max selection must be 0 or more."),
}).refine(data => data.maxSelection === 0 || data.maxSelection >= data.minSelection, {
    message: "Max selection must be 0 (for unlimited) or greater than or equal to min selection.",
    path: ["maxSelection"],
});

const activeTimeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const comboMenuSchema = z.object({
    id: z.string().optional(),
    brandId: z.string().min(1, 'A brand must be selected.'),
    locationIds: z.array(z.string()).min(1, 'At least one location must be selected.'),
    comboName: z.string().min(2, 'Combo name must be at least 2 characters.'),
    description: z.string().optional(),
    imageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().nullable(),
    pickupPrice: z.coerce.number().min(0, "Price must be a non-negative number.").optional(),
    deliveryPrice: z.coerce.number().min(0, "Price must be a non-negative number.").optional(),
    isActive: z.boolean().default(true),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    activeDays: z.array(z.string()).optional().default([]),
    activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
    orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type must be selected.'),
    tags: z.array(z.enum(['Popular', 'Recommended', 'Campaign'])).optional().default([]),
    productGroups: z.array(productGroupSchema).min(1, 'At least one product group must be configured.'),
}).refine(data => data.pickupPrice !== undefined || data.deliveryPrice !== undefined, {
    message: "At least one price (Pickup or Delivery) must be provided.",
    path: ["pickupPrice"],
}).refine(data => {
    return !(data.orderTypes.includes('pickup') && (data.pickupPrice === undefined || data.pickupPrice === null));
}, {
    message: "Pickup price must be set if pickup is an available order type.",
    path: ["pickupPrice"],
}).refine(data => {
    return !(data.orderTypes.includes('delivery') && (data.deliveryPrice === undefined || data.deliveryPrice === null));
}, {
    message: "Delivery price must be set if delivery is an available order type.",
    path: ["deliveryPrice"],
});


type ComboFormValues = z.infer<typeof comboMenuSchema>;

interface ComboFormPageProps {
  combo?: ComboMenu;
  brands: Brand[];
  locations: Location[];
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const COMBO_TAGS = ['Popular', 'Recommended', 'Campaign'];

interface ProductGroupCardProps {
    index: number;
    control: any;
    remove: (index: number) => void;
    brandProducts: ProductForMenu[];
    brandCategories: Category[];
    isProductsLoading: boolean;
}

function ProductGroupCard({ index, control, remove, brandProducts, brandCategories, isProductsLoading }: ProductGroupCardProps) {
    const [categoryFilter, setCategoryFilter] = useState('all');

    const filteredProducts = useMemo(() => {
        if (categoryFilter === 'all') return brandProducts;
        return brandProducts.filter(p => p.categoryId === categoryFilter);
    }, [brandProducts, categoryFilter]);
    
    return (
         <Card key={index} className="p-4 relative">
            <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6 text-destructive" onClick={() => remove(index)}>
                <Trash2 className="h-4 w-4" />
            </Button>
            <div className="space-y-4">
                <FormField control={control} name={`productGroups.${index}.groupName`} render={({field}) => (<FormItem><FormLabel>Group Name</FormLabel><FormControl><Input placeholder="e.g. Main Dish" {...field}/></FormControl><FormMessage/></FormItem>)}/>
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={control} name={`productGroups.${index}.minSelection`} render={({field}) => (<FormItem><FormLabel>Min. Selection</FormLabel><FormControl><Input type="number" placeholder="1" {...field}/></FormControl><FormMessage/></FormItem>)}/>
                    <FormField control={control} name={`productGroups.${index}.maxSelection`} render={({field}) => (<FormItem><FormLabel>Max. Selection</FormLabel><FormControl><Input type="number" placeholder="1" {...field}/></FormControl><FormDescription>0 for unlimited</FormDescription><FormMessage/></FormItem>)}/>
                </div>
            </div>
            <FormField control={control} name={`productGroups.${index}.productIds`} render={() => (
                <FormItem className="mt-4">
                    <div className="flex justify-between items-center">
                        <FormLabel>Products</FormLabel>
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger className="w-[200px] h-8 text-xs">
                                <SelectValue placeholder="Filter by category..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                {brandCategories.map(cat => (
                                <SelectItem key={cat.id} value={cat.id}>{cat.categoryName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <ScrollArea className="h-40 rounded-md border">
                        <div className="p-4">
                            {isProductsLoading ? (
                                <p className="text-sm text-muted-foreground">Loading products...</p>
                            ) : filteredProducts.map((p) => (
                                <FormField key={p.id} control={control} name={`productGroups.${index}.productIds`} render={({field}) => (
                                    <FormItem className="flex items-center space-x-2">
                                        <FormControl>
                                            <Checkbox name={field.name} checked={field.value?.includes(p.id)} onCheckedChange={(checked) => checked ? field.onChange([...field.value, p.id]) : field.onChange(field.value?.filter(id => id !== p.id))}/>
                                        </FormControl>
                                        <FormLabel className="font-normal text-sm">{p.productName}</FormLabel>
                                    </FormItem>
                                )}/>
                            ))}
                        </div>
                    </ScrollArea>
                    <FormMessage/>
                </FormItem>
            )}/>
        </Card>
    );
}


export function ComboFormPage({ combo, brands, locations }: ComboFormPageProps) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    
    const [brandProducts, setBrandProducts] = useState<ProductForMenu[]>([]);
    const [brandCategories, setBrandCategories] = useState<Category[]>([]);
    const [isProductsLoading, setIsProductsLoading] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState('all');

    const form = useForm<ComboFormValues>({
        resolver: zodResolver(comboMenuSchema),
        defaultValues: combo ? {
            ...combo,
            startDate: combo.startDate,
            endDate: combo.endDate,
            imageUrl: combo.imageUrl || '',
            pickupPrice: combo.pickupPrice ?? undefined,
            deliveryPrice: combo.deliveryPrice ?? undefined,
            productGroups: combo.productGroups || [],
            activeTimeSlots: combo.activeTimeSlots || [],
        } : {
            brandId: '',
            locationIds: [],
            comboName: '',
            description: '',
            isActive: true,
            imageUrl: '',
            orderTypes: ['pickup', 'delivery'],
            activeDays: WEEKDAYS,
            activeTimeSlots: [{start: '00:00', end: '23:59'}],
            productGroups: [],
            tags: [],
        },
    });

    const { control, watch, setValue, getValues, reset, formState } = form;

    const { fields: groupFields, append: appendGroup, remove: removeGroup } = useFieldArray({
        control, name: "productGroups"
    });
    
    const { fields: timeSlotFields, append: appendTimeSlot, remove: removeTimeSlot } = useFieldArray({
        control, name: "activeTimeSlots"
    });

    useEffect(() => {
        if (combo) {
            reset({
                ...combo,
                imageUrl: combo.imageUrl || '',
                pickupPrice: combo.pickupPrice ?? undefined,
                deliveryPrice: combo.deliveryPrice ?? undefined,
                productGroups: combo.productGroups || [],
                activeTimeSlots: combo.activeTimeSlots || [],
            });
        }
    }, [combo, reset]);


    const selectedBrandId = watch('brandId');
    const watchedProductGroups = watch('productGroups');
    const pickupPrice = watch('pickupPrice');
    const deliveryPrice = watch('deliveryPrice');
    const orderTypes = watch('orderTypes');
    const imageUrl = watch('imageUrl');

    const availableLocations = useMemo(() => {
        if (!selectedBrandId) return [];
        return locations.filter(l => l.brandId === selectedBrandId);
    }, [selectedBrandId, locations]);
    
    useEffect(() => {
        if (selectedBrandId) {
            setIsProductsLoading(true);
            Promise.all([
                getProductsForBrand(selectedBrandId),
                getCategoriesForBrand(selectedBrandId)
            ]).then(([products, categories]) => {
                setBrandProducts(products as ProductForMenu[]);
                setBrandCategories(categories);
            }).finally(() => {
                setIsProductsLoading(false);
            });
            
            if (combo?.brandId !== selectedBrandId) {
                setValue('locationIds', []);
                setValue('productGroups', []);
            }
        } else {
            setBrandProducts([]);
            setBrandCategories([]);
            setValue('locationIds', []);
        }
    }, [selectedBrandId, setValue, combo?.brandId]);

    const title = combo ? 'Edit Combo' : 'Create New Combo';
    const description = combo ? `Editing details for ${combo.comboName}.` : 'Fill in the details for the new combo deal.';
    
    const calculateNormalPrice = (priceType: 'pickup' | 'delivery'): number => {
      if (!watchedProductGroups || watchedProductGroups.length === 0 || brandProducts.length === 0) {
        return 0;
      }
      return watchedProductGroups.reduce((total, group) => {
        const highestPricedProductInGroup = group.productIds.reduce((maxPrice, productId) => {
          const product = brandProducts.find(p => p.id === productId);
          if (!product) return maxPrice;
          const price = priceType === 'delivery' ? (product.priceDelivery ?? product.price) : product.price;
          return Math.max(maxPrice, price);
        }, 0);
        return total + (highestPricedProductInGroup * (group.minSelection || 1));
      }, 0);
    }
    
    const normalPricePickup = useMemo(() => calculateNormalPrice('pickup'), [watchedProductGroups, brandProducts]);
    const normalPriceDelivery = useMemo(() => calculateNormalPrice('delivery'), [watchedProductGroups, brandProducts]);
    
    const pickupDifference = useMemo(() => (typeof pickupPrice === 'number' ? normalPricePickup - pickupPrice : undefined), [pickupPrice, normalPricePickup]);
    const deliveryDifference = useMemo(() => (typeof deliveryPrice === 'number' ? normalPriceDelivery - deliveryPrice : undefined), [deliveryPrice, normalPriceDelivery]);
    
    useEffect(() => {
        if ((pickupPrice === undefined || pickupPrice === null) && orderTypes.includes('pickup')) {
            setValue('orderTypes', orderTypes.filter(t => t !== 'pickup'));
        }
        if ((deliveryPrice === undefined || deliveryPrice === null) && orderTypes.includes('delivery')) {
            setValue('orderTypes', orderTypes.filter(t => t !== 'delivery'));
        }
    }, [pickupPrice, deliveryPrice, orderTypes, setValue]);

    const handleFormSubmit = form.handleSubmit((data) => {
        const formData = new FormData();

        // Manually append data to FormData
        if (combo?.id) formData.append('id', combo.id);
        Object.entries(data).forEach(([key, value]) => {
            if (key === 'productGroups' || key === 'activeTimeSlots') return;

            if (Array.isArray(value)) {
                value.forEach(item => formData.append(key, String(item)));
            } else if (value !== null && value !== undefined) {
                formData.append(key, String(value));
            }
        });
        
        formData.append('productGroups', JSON.stringify(data.productGroups));
        formData.append('activeTimeSlots', JSON.stringify(data.activeTimeSlots));

        startTransition(async () => {
            const result = await createOrUpdateCombo(null, formData);
             if (result?.error && result.errors) {
                toast({ variant: 'destructive', title: 'Validation Failed', description: 'Please check the form for errors.' });
                result.errors.forEach(error => {
                    form.setError(error.path.join('.') as any, { message: error.message });
                });
            } else if (result?.error) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    });


  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit} className="space-y-6">
        {combo?.id && <input type="hidden" name="id" value={combo.id} />}
        <div className="flex items-center justify-between">
            <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="text-muted-foreground">{description}</p></div>
            <div className="flex gap-2"><Button type="button" variant="outline" asChild><Link href="/superadmin/combos">Cancel</Link></Button><Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : (combo ? 'Save Changes' : 'Create Combo')}</Button></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader><CardTitle>Core Details</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={control} name="brandId" render={({ field }) => (
                            <FormItem><FormLabel>Brand</FormLabel><Select onValueChange={field.onChange} value={field.value} defaultValue={field.value} disabled={!!combo}><FormControl><SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger></FormControl><SelectContent>{brands.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
                        )}/>
                        
                        <FormField control={control} name="comboName" render={({ field }) => (
                            <FormItem><FormLabel>Combo Name</FormLabel><FormControl><Input placeholder="e.g., Family Feast" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={control} name="description" render={({ field }) => (
                            <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="A short description of the combo deal." {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={control} name="imageUrl"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Combo Image URL (Optional)</FormLabel>
                                <FormControl><Input placeholder="https://example.com/image.png" {...field} value={field.value ?? ''} /></FormControl>
                                {imageUrl && (<div className="relative mt-2 h-32 w-48"><Image src={imageUrl} alt="Combo preview" fill className="rounded-md border object-cover" data-ai-hint="food deal"/></div>)}
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Locations</CardTitle><CardDescription>Select which locations this combo is available at.</CardDescription></CardHeader>
                    <CardContent>
                        <FormField control={control} name="locationIds"
                            render={() => (
                                <FormItem>
                                <ScrollArea className="h-40 rounded-md border">
                                    <div className="p-4">
                                    {availableLocations.map((item) => (
                                        <FormField key={item.id} control={control} name="locationIds"
                                        render={({ field }) => (<FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0 mb-2"><FormControl><Checkbox name={field.name} checked={field.value?.includes(item.id)} onCheckedChange={(checked) => {const currentValue = field.value || []; return checked ? field.onChange([...currentValue, item.id]) : field.onChange(currentValue?.filter((value) => value !== item.id))}}/></FormControl><FormLabel className="font-normal">{item.name}</FormLabel></FormItem>)} />
                                    ))}
                                    </div>
                                </ScrollArea><FormMessage /></FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Product Groups</CardTitle><CardDescription>Build your combo by adding groups of products.</CardDescription></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-4">
                          {groupFields.map((group, index) => (
                            <ProductGroupCard 
                                key={group.id}
                                index={index}
                                control={control}
                                remove={removeGroup}
                                brandProducts={brandProducts}
                                brandCategories={brandCategories}
                                isProductsLoading={isProductsLoading}
                            />
                          ))}
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => appendGroup({ id: crypto.randomUUID(), groupName: '', productIds: [], minSelection: 1, maxSelection: 1 })}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Product Group
                        </Button>
                    </CardContent>
                </Card>
            </div>
            
            <div className="space-y-6">
                <Card>
                    <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 rounded-lg bg-muted space-y-2">
                            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Normal Price (Pickup)</span><span className="font-semibold">kr. {normalPricePickup.toFixed(2)}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Normal Price (Delivery)</span><span className="font-semibold">kr. {normalPriceDelivery.toFixed(2)}</span></div>
                            <Separator/>
                            {typeof pickupDifference === 'number' && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Pickup Savings</span><span className={cn("font-semibold", pickupDifference > 0 ? 'text-green-600' : 'text-destructive')}>{pickupDifference >= 0 ? `kr. ${pickupDifference.toFixed(2)}` : `-kr. ${Math.abs(pickupDifference).toFixed(2)}`}</span></div>}
                            {typeof deliveryDifference === 'number' && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Delivery Savings</span><span className={cn("font-semibold", deliveryDifference > 0 ? 'text-green-600' : 'text-destructive')}>{deliveryDifference >= 0 ? `kr. ${deliveryDifference.toFixed(2)}` : `-kr. ${Math.abs(deliveryDifference).toFixed(2)}`}</span></div>}
                        </div>
                        <FormField control={control} name="pickupPrice" render={({ field }) => (
                            <FormItem><FormLabel>Pickup Price</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={control} name="deliveryPrice" render={({ field }) => (
                            <FormItem><FormLabel>Delivery Price</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                        )}/>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={control} name="isActive" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>Active</FormLabel><FormDescription>Is this combo available for purchase?</FormDescription></div><FormControl><Switch name="isActive" checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                        )}/>
                        
                        <FormField control={control} name="orderTypes" render={() => (
                            <FormItem><FormLabel>Order Type Availability</FormLabel>
                                <div className="flex gap-4 pt-2">
                                    <FormField control={control} name="orderTypes" render={({ field }) => (
                                        <FormItem className="flex items-center space-x-2"><FormControl><Checkbox name={field.name} checked={field.value?.includes('pickup')} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), 'pickup']) : field.onChange((field.value || [])?.filter(v => v !== 'pickup'))} disabled={pickupPrice === undefined || pickupPrice === null}/></FormControl><FormLabel className={cn("font-normal capitalize", (pickupPrice === undefined || pickupPrice === null) && 'text-muted-foreground')}>Pickup</FormLabel></FormItem>
                                    )}/>
                                    <FormField control={control} name="orderTypes" render={({ field }) => (
                                        <FormItem className="flex items-center space-x-2"><FormControl><Checkbox name={field.name} checked={field.value?.includes('delivery')} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), 'delivery']) : field.onChange((field.value || [])?.filter(v => v !== 'delivery'))} disabled={deliveryPrice === undefined || deliveryPrice === null}/></FormControl><FormLabel className={cn("font-normal capitalize", (deliveryPrice === undefined || deliveryPrice === null) && 'text-muted-foreground')}>Delivery</FormLabel></FormItem>
                                    )}/>
                                </div><FormMessage />
                            </FormItem>
                        )}/>

                         <FormField control={control} name="tags" render={() => (
                            <FormItem>
                                <FormLabel>Tags</FormLabel>
                                <div className="flex gap-2 flex-wrap pt-2">
                                {COMBO_TAGS.map(item => (
                                    <FormField key={item} control={control} name="tags" render={({ field }) => (
                                        <FormItem key={item} className="flex flex-row items-start space-x-3 space-y-0">
                                            <FormControl><Checkbox name={field.name} checked={field.value?.includes(item as any)} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), item as any]) : field.onChange((field.value || [])?.filter(v => v !== item))}/></FormControl>
                                            <FormLabel className="font-normal">{item}</FormLabel>
                                        </FormItem>
                                    )}/>
                                ))}
                                </div><FormMessage />
                            </FormItem>
                        )}/>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader><CardTitle>Availability</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                         <FormField control={control} name="activeDays" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Active Weekdays</FormLabel>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-2">
                                {WEEKDAYS.map(day => (
                                     <FormItem key={day} className="flex items-center space-x-2"><FormControl><Checkbox checked={field.value?.includes(day)} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), day]) : field.onChange((field.value || [])?.filter(v => v !== day))}/></FormControl><FormLabel className="font-normal capitalize text-sm">{day}</FormLabel></FormItem>
                                ))}
                                </div><FormMessage />
                            </FormItem>
                         )}/>
                         
                        <Separator/>
                        
                        <div className="space-y-2">
                            <FormLabel>Active Time Slots</FormLabel>
                             {timeSlotFields.map((field, index) => (
                                <div key={field.id} className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <FormField control={control} name={`activeTimeSlots.${index}.start`} render={({field}) => (<FormItem className="flex-1"><FormControl><Input type="time" {...field}/></FormControl><FormMessage/></FormItem>)}/>
                                    <span>-</span>
                                    <FormField control={control} name={`activeTimeSlots.${index}.end`} render={({field}) => (<FormItem className="flex-1"><FormControl><Input type="time" {...field}/></FormControl><FormMessage/></FormItem>)}/>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeTimeSlot(index)}><Trash2 className="h-4 w-4"/></Button>
                                </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={() => appendTimeSlot({start: '00:00', end: '23:59'})}><PlusCircle className="mr-2 h-4 w-4"/> Add Time Slot</Button>
                        </div>
                         
                        <Separator/>
                         
                        <FormField control={control} name="startDate" render={({ field }) => (
                             <FormItem className="flex flex-col"><FormLabel>Start Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem>
                        )}/>
                        <FormField control={control} name="endDate" render={({ field }) => (
                            <FormItem className="flex flex-col"><FormLabel>End Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem>
                        )}/>
                    </CardContent>
                </Card>
            </div>
        </div>
      </form>
    </Form>
  );
}
