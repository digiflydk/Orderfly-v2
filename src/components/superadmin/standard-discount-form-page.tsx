

'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { useEffect, useMemo, useState, useTransition, useActionState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, PlusCircle, Trash2, Clock } from 'lucide-react';
import { useFormStatus } from 'react-dom';

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { StandardDiscount, Brand, Product, Location, Category, ProductForMenu } from '@/types';
import { createOrUpdateStandardDiscount, type FormState } from '@/app/superadmin/standard-discounts/actions';
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


const activeTimeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const standardDiscountSchema = z.object({
  id: z.string().optional(),
  brandId: z.string().min(1, 'A brand must be selected.'),
  locationIds: z.array(z.string()).min(1, { message: 'At least one location must be selected.' }),
  discountName: z.string().min(2, 'Discount name is required.'),
  discountType: z.enum(['product', 'category', 'cart', 'free_delivery']),
  referenceIds: z.array(z.string()).optional().default([]),
  discountMethod: z.enum(['percentage', 'fixed_amount']),
  discountValue: z.coerce.number().positive('Discount value must be positive.').optional(),
  minOrderValue: z.coerce.number().min(0).optional(),
  isActive: z.boolean().default(true),
  orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type is required.'),
  activeDays: z.array(z.string()).optional().default([]),
  activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
  timeSlotValidationType: z.enum(['orderTime', 'pickupTime']),
  startDate: z.string().or(z.date()).optional(),
  endDate: z.string().or(z.date()).optional(),
  allowStacking: z.boolean().default(false),
  // New marketing fields
  discountHeading: z.string().optional(),
  discountDescription: z.string().optional(),
  discountImageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().nullable(),
  assignToOfferCategory: z.boolean().default(false),
}).superRefine((data, ctx) => {
    if (data.discountType === 'product' && (!data.referenceIds || data.referenceIds.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['referenceIds'],
            message: 'At least one Product must be selected for this discount type.',
        });
    }
    if (data.discountType === 'category' && (!data.referenceIds || data.referenceIds.length === 0)) {
       ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['referenceIds'],
            message: 'At least one Category must be selected for this discount type.',
        });
    }
    if ((data.discountType === 'cart' || data.discountType === 'free_delivery') && (!data.minOrderValue || data.minOrderValue <= 0)) {
       ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['minOrderValue'],
            message: 'A minimum order value is required for this discount type.',
        });
    }
    if ((data.discountMethod === 'percentage' || data.discountMethod === 'fixed_amount') && data.discountType !== 'free_delivery' && (!data.discountValue || data.discountValue <= 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['discountValue'],
            message: 'A positive discount value is required for this discount method.',
        });
    }
});



type DiscountFormValues = z.infer<typeof standardDiscountSchema>;

interface StandardDiscountFormPageProps {
  discount?: SerializedStandardDiscount;
  brands: Brand[];
  locations: Location[];
  products: Product[];
  categories: Category[];
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];


export function StandardDiscountFormPage({ discount, brands, locations, products, categories }: StandardDiscountFormPageProps) {
    const { toast } = useToast();
    const [imagePreview, setImagePreview] = useState<string | null>(discount?.discountImageUrl || null);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [isClient, setIsClient] = useState(false);
    
    useEffect(() => {
        setIsClient(true);
    }, []);
    
    const form = useForm<DiscountFormValues>({
        resolver: zodResolver(standardDiscountSchema),
        defaultValues: discount ? {
            ...discount,
            minOrderValue: discount.minOrderValue ?? 0,
            discountValue: discount.discountValue ?? undefined,
            discountHeading: discount.discountHeading ?? '',
            discountDescription: discount.discountDescription ?? '',
            referenceIds: discount.referenceIds || [],
            startDate: discount.startDate ? new Date(discount.startDate) : undefined,
            endDate: discount.endDate ? new Date(discount.endDate) : undefined,
        } : {
            brandId: '', locationIds: [], discountName: '', discountType: 'product' as const, referenceIds: [],
            discountMethod: 'percentage' as const, discountValue: undefined, minOrderValue: 0, isActive: true,
            orderTypes: ['pickup' as const, 'delivery' as const], activeDays: WEEKDAYS, activeTimeSlots: [{start: '00:00', end: '23:59'}],
            timeSlotValidationType: 'orderTime' as const, allowStacking: false, discountHeading: '',
            discountDescription: '', assignToOfferCategory: false
        },
    });

    const { control, watch, setValue, getValues, register, reset, formState } = form;

    const selectedBrandId = watch('brandId');
    const discountType = watch('discountType');
    const discountMethod = watch('discountMethod');
    const imageUrl = watch('imageUrl');

    const availableLocations = useMemo(() => {
        if (!selectedBrandId) return [];
        return locations.filter(l => l.brandId === selectedBrandId);
    }, [selectedBrandId, locations]);
    
    const { brandProducts, brandCategories } = useMemo(() => {
        if (!selectedBrandId) {
            return { brandProducts: [], brandCategories: [] };
        }
        const brandLocationIds = new Set(locations.filter(l => l.brandId === selectedBrandId).map(l => l.id));

        const categoriesForBrand = categories.filter(c => 
            c.locationIds.some(locId => brandLocationIds.has(locId))
        );
        const productsForBrand = products.filter(p => p.brandId === selectedBrandId);
        
        return { brandProducts: productsForBrand, brandCategories: categoriesForBrand };
    }, [selectedBrandId, locations, products, categories]);

    const filteredBrandProducts = useMemo(() => {
        if (categoryFilter === 'all') return brandProducts;
        return brandProducts.filter(p => p.categoryId === categoryFilter);
    }, [brandProducts, categoryFilter]);
    
    useEffect(() => {
        if (discountType === 'cart' || discountType === 'free_delivery') {
            setValue('referenceIds', []);
        }
    }, [discountType, setValue]);

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const title = discount ? 'Edit Standard Discount' : 'Create New Standard Discount';
    const description = discount ? `Editing details for ${discount.discountName}.` : 'Fill in the details for the new automatic discount.';
    
    const [isPending, startTransition] = useTransition();

    const handleFormSubmit = form.handleSubmit((data) => {
        const formData = new FormData();
        const imageInput = document.querySelector('input[name="discountImageUrl"]') as HTMLInputElement;

        if (discount?.id) formData.append('id', discount.id);
        
        Object.entries(data).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            
            if (key === 'activeTimeSlots' || key === 'imageUrl') return;

            if (key === 'startDate' || key === 'endDate') {
                if (value) {
                    formData.append(key, (value as Date).toISOString());
                }
                return;
            }

            if (key === 'isActive' || key === 'allowStacking' || key === 'assignToOfferCategory') {
                if (value === true) {
                    formData.append(key, 'on');
                }
                return;
            }

            if (Array.isArray(value)) {
                value.forEach(item => formData.append(key, String(item)));
            } else {
                formData.append(key, String(value));
            }
        });
        
        formData.append('activeTimeSlots', JSON.stringify(data.activeTimeSlots));

        if (imageInput?.files?.[0]) {
            formData.append('discountImageUrl', imageInput.files[0]);
        }
        
        startTransition(async () => {
            const result = await createOrUpdateStandardDiscount(null, formData);
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

    if (!isClient) {
        return <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="text-muted-foreground">{description}</p></div>
                <div className="flex gap-2"><Button variant="outline">Cancel</Button><Button disabled>Loading...</Button></div>
            </div>
            <Card><CardContent><p className="py-8 text-center">Loading form...</p></CardContent></Card>
        </div>;
    }

  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit} className="space-y-6" key={discount?.id || 'new'}>
        {discount?.id && <input type="hidden" name="id" value={discount.id} />}
        <div className="flex items-center justify-between">
            <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="text-muted-foreground">{description}</p></div>
            <div className="flex gap-2"><Button type="button" variant="outline" asChild><Link href="/superadmin/standard-discounts">Cancel</Link></Button><Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : (discount ? 'Save Changes' : 'Create Discount')}</Button></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader><CardTitle>Core Details</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={control} name="brandId" render={({ field }) => (
                            <FormItem><FormLabel>Brand</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value} disabled={!!discount}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger></FormControl>
                                    <SelectContent>{brands.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent>
                                </Select>
                                {!!discount && <FormDescription>Cannot change the brand for an existing discount.</FormDescription>}
                                <FormMessage />
                            </FormItem>
                        )}/>
                        
                        <FormField control={control} name="discountName" render={({ field }) => (
                            <FormItem><FormLabel>Discount Name (Admin only)</FormLabel><FormControl><Input placeholder="e.g., Weekly Pizza Special" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                         <FormField control={control} name="locationIds" render={() => (
                            <FormItem>
                                <FormLabel>Locations</FormLabel>
                                <FormDescription>Select which locations this discount is available at.</FormDescription>
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
                    <CardHeader><CardTitle>Discount Scope & Value</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={control} name="discountType" render={({ field }) => (
                            <FormItem><FormLabel>Discount Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger></FormControl><SelectContent>
                                <SelectItem value="product">Specific Product(s)</SelectItem>
                                <SelectItem value="category">Specific Category(-ies)</SelectItem>
                                <SelectItem value="cart">Entire Cart</SelectItem>
                                <SelectItem value="free_delivery">Free Delivery</SelectItem>
                            </SelectContent></Select><FormMessage /></FormItem>
                        )}/>

                        {discountType === 'product' && (
                             <FormField control={control} name="referenceIds" render={() => (
                                <FormItem><FormLabel>Discounted Products</FormLabel>
                                 <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                    <SelectTrigger className="w-full sm:w-[240px] h-8 text-xs">
                                        <SelectValue placeholder="Filter products by category..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Categories</SelectItem>
                                        {brandCategories.map(cat => (<SelectItem key={cat.id} value={cat.id}>{cat.categoryName}</SelectItem>))}
                                    </SelectContent>
                                </Select>
                                <ScrollArea className="h-40 rounded-md border">
                                  <div className="p-4 space-y-2">
                                    {filteredBrandProducts.map((p) => (
                                        <FormField key={p.id} control={control} name="referenceIds" render={({ field }) => (
                                            <FormItem className="flex items-center space-x-2">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value?.includes(p.id)}
                                                        onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), p.id]) : field.onChange((field.value || [])?.filter(id => id !== p.id))}
                                                    />
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
                        )}

                        {discountType === 'category' && (
                            <FormField control={control} name="referenceIds" render={() => (
                                <FormItem><FormLabel>Discounted Categories</FormLabel>
                                <ScrollArea className="h-40 rounded-md border">
                                  <div className="p-4 space-y-2">
                                    {brandCategories.map((c) => (
                                        <FormField key={c.id} control={control} name="referenceIds" render={({ field }) => (
                                          <FormItem key={c.id} className="flex items-center space-x-2">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value?.includes(c.id)}
                                                    onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), c.id]) : field.onChange((field.value || [])?.filter(id => id !== c.id))}
                                                />
                                            </FormControl>
                                            <FormLabel className="font-normal text-sm">{c.categoryName}</FormLabel>
                                          </FormItem>
                                        )}/>
                                    ))}
                                  </div>
                                </ScrollArea>
                                <FormMessage/>
                                </FormItem>
                            )}/>
                        )}
                        
                        {(discountType === 'cart' || discountType === 'free_delivery') && (
                            <FormField control={control} name="minOrderValue" render={({ field }) => (
                                <FormItem><FormLabel>Minimum Order Value</FormLabel><FormControl><Input type="number" step="0.01" placeholder="e.g. 200" {...field} value={field.value ?? ''}/></FormControl><FormDescription>The cart total must be over this amount for the discount to apply.</FormDescription><FormMessage /></FormItem>
                            )}/>
                        )}

                        {discountType !== 'free_delivery' && (
                            <>
                                <Separator/>
                                <div className="grid grid-cols-2 gap-4">
                                     <FormField control={control} name="discountMethod" render={({ field }) => (
                                        <FormItem><FormLabel>Discount Method</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a method" /></SelectTrigger></FormControl><SelectContent>
                                            <SelectItem value="percentage">Percentage (%)</SelectItem>
                                            <SelectItem value="fixed_amount">Fixed Amount (DKK)</SelectItem>
                                        </SelectContent></Select><FormMessage /></FormItem>
                                    )}/>
                                    <FormField control={control} name="discountValue" render={({ field }) => (
                                        <FormItem><FormLabel>Discount Value</FormLabel><FormControl><Input type="number" step="0.01" placeholder="e.g. 10 or 50" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Marketing Display (Optional)</CardTitle>
                        <CardDescription>If filled out, this discount will be displayed as a promotional card on the menu.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={control} name="discountHeading" render={({ field }) => (<FormItem><FormLabel>Heading</FormLabel><FormControl><Input placeholder="E.g., Mid-Week Special" {...field} value={field.value ?? ''} /></FormControl></FormItem>)}/>
                        <FormField control={control} name="discountDescription" render={({ field }) => (<FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Short text to promote the offer." {...field} value={field.value ?? ''}/></FormControl></FormItem>)}/>
                         <FormItem>
                            <FormLabel>Image</FormLabel>
                            <FormControl>
                                <Input name="discountImageUrl" type="file" accept="image/*" onChange={handleImageChange} />
                            </FormControl>
                            {imagePreview && (<div className="relative mt-2 h-32 w-48"><Image src={imagePreview} alt="Discount preview" fill className="rounded-md border object-cover" data-ai-hint="food offer"/></div>)}
                        </FormItem>
                    </CardContent>
                </Card>

            </div>
            
            <div className="space-y-6">
                 <Card>
                    <CardHeader><CardTitle>Configuration & Availability</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={control} name="isActive" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>Active</FormLabel></div><FormControl><Switch name="isActive" checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                        )}/>
                        <FormField control={control} name="allowStacking" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>Allow Stacking</FormLabel></div><FormControl><Switch name="allowStacking" checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                        )}/>
                        <FormField control={control} name="assignToOfferCategory" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>Show in "Offers" Category</FormLabel></div><FormControl><Switch name="assignToOfferCategory" checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                        )}/>
                        
                        <Separator/>
                        
                        <FormField control={control} name="orderTypes" render={() => (
                            <FormItem><FormLabel>Order Type Availability</FormLabel>
                                <div className="flex gap-4 pt-2">
                                    <FormField control={control} name="orderTypes" render={({ field }) => (
                                        <FormItem className="flex items-center space-x-2"><FormControl><Checkbox name={field.name} checked={field.value?.includes('pickup')} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), 'pickup']) : field.onChange((field.value || [])?.filter(v => v !== 'pickup'))}/></FormControl><FormLabel className="font-normal capitalize">Pickup</FormLabel></FormItem>
                                    )}/>
                                    <FormField control={control} name="orderTypes" render={({ field }) => (
                                        <FormItem className="flex items-center space-x-2"><FormControl><Checkbox name={field.name} checked={field.value?.includes('delivery')} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), 'delivery']) : field.onChange((field.value || [])?.filter(v => v !== 'delivery'))}/></FormControl><FormLabel className="font-normal capitalize">Delivery</FormLabel></FormItem>
                                    )}/>
                                </div><FormMessage />
                            </FormItem>
                        )}/>
                        <Separator />

                        <FormField control={control} name="timeSlotValidationType" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Time Slot Validation Type</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select validation type" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="orderTime">Based on order time</SelectItem>
                                        <SelectItem value="pickupTime">Based on pickup/dispatch time</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormDescription>Choose when the time slot discount should be validated.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}/>
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
                         
                        <div className="space-y-2">
                            <FormLabel>Active Time Slots</FormLabel>
                             {watch('activeTimeSlots')?.map((field, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <Input type="time" {...register(`activeTimeSlots.${index}.start`)} />
                                    <span>-</span>
                                    <Input type="time" {...register(`activeTimeSlots.${index}.end`)} />
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setValue('activeTimeSlots', watch('activeTimeSlots').filter((_, i) => i !== index)) }><Trash2 className="h-4 w-4"/></Button>
                                </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={() => setValue('activeTimeSlots', [...(watch('activeTimeSlots') || []), {start: '00:00', end: '23:59'}])}><PlusCircle className="mr-2 h-4 w-4"/> Add Time Slot</Button>
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

