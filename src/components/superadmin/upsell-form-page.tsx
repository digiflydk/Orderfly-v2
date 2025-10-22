

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
import type { Upsell, Brand, Product, Location, Category, ProductForMenu } from '@/types';
import { createOrUpdateUpsell, getProductsForBrand, getCategoriesForBrand, type FormState } from '@/app/superadmin/upsells/actions';
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

const triggerConditionSchema = z.object({
    id: z.string(),
    type: z.enum(['product_in_cart', 'category_in_cart', 'cart_value_over', 'combo_in_cart', 'product_tag_in_cart']),
    referenceId: z.string().min(1, 'A reference value is required.'),
});

const upsellSchema = z.object({
    id: z.string().optional(),
    brandId: z.string().min(1, 'A brand must be selected.'),
    locationIds: z.array(z.string()).min(1, 'At least one location must be selected.'),
    upsellName: z.string().min(2, 'Upsell name must be at least 2 characters.'),
    description: z.string().optional(),
    imageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().nullable(),
    
    offerType: z.enum(['product', 'category']),
    offerProductIds: z.array(z.string()).optional().default([]),
    offerCategoryIds: z.array(z.string()).optional().default([]),

    discountType: z.enum(['none', 'percentage', 'fixed_amount']),
    discountValue: z.coerce.number().optional(),

    triggerConditions: z.array(triggerConditionSchema).min(1, 'At least one trigger condition is required.'),

    orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type must be selected.'),
    activeDays: z.array(z.string()).optional().default([]),
    activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    isActive: z.boolean().default(true),
    tags: z.array(z.enum(['Popular', 'Recommended', 'Campaign'])).optional().default([]),
}).refine(data => {
    return !(data.offerType === 'product' && data.offerProductIds.length === 0);
}, {
    message: "At least one product must be selected for a product-based offer.",
    path: ["offerProductIds"],
}).refine(data => {
    return !(data.offerType === 'category' && data.offerCategoryIds.length === 0);
}, {
    message: "At least one category must be selected for a category-based offer.",
    path: ["offerCategoryIds"],
}).refine(data => {
    return !((data.discountType === 'percentage' || data.discountType === 'fixed_amount') && (data.discountValue === undefined || data.discountValue <= 0));
}, {
    message: "A positive discount value is required for this discount type.",
    path: ["discountValue"],
});


type UpsellFormValues = z.infer<typeof upsellSchema>;

interface UpsellFormPageProps {
  upsell?: Upsell;
  brands: Brand[];
  locations: Location[];
  products: Product[];
  categories: Category[];
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const UPSELL_TAGS = ['Popular', 'Recommended', 'Campaign'];

function SubmitButton({ isEditing }: { isEditing: boolean }) {
    const { pending } = useFormStatus();
    return <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : (isEditing ? 'Save Changes' : 'Create Upsell')}</Button>;
}


export function UpsellFormPage({ upsell, brands, locations, products, categories }: UpsellFormPageProps) {
    const { toast } = useToast();
    const [state, formAction] = useActionState(createOrUpdateUpsell, null);
    
    const [brandProducts, setBrandProducts] = useState<ProductForMenu[]>([]);
    const [brandCategories, setBrandCategories] = useState<Category[]>([]);
    const [isProductsLoading, setIsProductsLoading] = useState(false);

    const form = useForm<UpsellFormValues>({
        resolver: zodResolver(upsellSchema),
        defaultValues: upsell ? {
            ...upsell,
            discountValue: upsell.discountValue ?? undefined,
            startDate: upsell.startDate ? new Date(upsell.startDate) : undefined,
            endDate: upsell.endDate ? new Date(upsell.endDate) : undefined,
        } : {
            brandId: '',
            locationIds: [],
            upsellName: '',
            description: '',
            offerType: 'product',
            offerProductIds: [],
            offerCategoryIds: [],
            discountType: 'none',
            tags: [],
            isActive: true,
            orderTypes: ['pickup', 'delivery'],
            activeDays: WEEKDAYS,
            activeTimeSlots: [{start: '00:00', end: '23:59'}],
            triggerConditions: [],
        },
    });

    const { control, watch, setValue, getValues, reset, formState } = form;

    const { fields: groupFields, append: appendGroup, remove: removeGroup } = useFieldArray({
        control, name: "productGroups"
    });
    
    const { fields: timeSlotFields, append: appendTimeSlot, remove: removeTimeSlot } = useFieldArray({
        control, name: "activeTimeSlots"
    });
    
    const { fields: triggerFields, append: appendTrigger, remove: removeTrigger } = useFieldArray({
        control, name: "triggerConditions"
    });

    const selectedBrandId = watch('brandId');
    const offerType = watch('offerType');
    const discountType = watch('discountType');
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
            
            if (upsell?.brandId !== selectedBrandId) {
                setValue('locationIds', []);
                setValue('triggerConditions', []);
                setValue('offerProductIds', []);
                setValue('offerCategoryIds', []);
            }
        } else {
            setBrandProducts([]);
            setBrandCategories([]);
            setValue('locationIds', []);
        }
    }, [selectedBrandId, setValue, upsell?.brandId]);
    
    useEffect(() => {
        if (state?.message) {
            if (state.error) {
                toast({ variant: 'destructive', title: 'Error', description: state.message });
                if (state.errors) {
                    state.errors.forEach(error => {
                        form.setError(error.path.join('.') as any, { message: error.message });
                    });
                }
            }
        }
    }, [state, toast, form]);


    const title = upsell ? 'Edit Upsell' : 'Create New Upsell';
    const description = upsell ? `Editing details for ${upsell.upsellName}.` : 'Fill in the details for the new upsell campaign.';
    
    const handleFormSubmit = (formData: FormData) => {
        const formValues = getValues();
        formData.append('triggerConditions', JSON.stringify(formValues.triggerConditions || []));
        formData.append('activeTimeSlots', JSON.stringify(formValues.activeTimeSlots || []));
        formAction(formData);
    }

  return (
    <Form {...form}>
      <form action={handleFormSubmit} className="space-y-6">
        {upsell?.id && <input type="hidden" name="id" value={upsell.id} />}
        <div className="flex items-center justify-between">
            <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="text-muted-foreground">{description}</p></div>
            <div className="flex gap-2"><Button type="button" variant="outline" asChild><Link href="/superadmin/upsells">Cancel</Link></Button><SubmitButton isEditing={!!upsell} /></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader><CardTitle>Core Details</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={control} name="brandId" render={({ field }) => (
                            <FormItem><FormLabel>Brand</FormLabel><Select onValueChange={field.onChange} value={field.value} defaultValue={field.value} disabled={!!upsell}><FormControl><SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger></FormControl><SelectContent>{brands.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
                        )}/>
                        
                        <FormField control={control} name="locationIds"
                            render={() => (
                                <FormItem>
                                <FormLabel>Locations</FormLabel>
                                <FormDescription>Select which locations this upsell is available at.</FormDescription>
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

                        <Separator/>

                        <FormField control={control} name="upsellName" render={({ field }) => (
                            <FormItem><FormLabel>Upsell Name</FormLabel><FormControl><Input placeholder="e.g., Add Fries & Soda" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={control} name="description" render={({ field }) => (
                            <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="A short description of the upsell offer." {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={control} name="imageUrl"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Upsell Image URL (Optional)</FormLabel>
                                <FormControl><Input placeholder="https://example.com/image.png" {...field} value={field.value ?? ''} /></FormControl>
                                {imageUrl && (<div className="relative mt-2 h-32 w-48"><Image src={imageUrl} alt="Upsell preview" fill className="rounded-md border object-cover" data-ai-hint="food deal"/></div>)}
                                <FormDescription>If no URL is provided, the image of the first offered product will be used.</FormDescription>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader><CardTitle>Offer & Discount</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                       <FormField control={control} name="offerType" render={({ field }) => (
                            <FormItem><FormLabel>Offer Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an offer type" /></SelectTrigger></FormControl><SelectContent>
                                <SelectItem value="product">Specific Product(s)</SelectItem>
                                <SelectItem value="category">Whole Category</SelectItem>
                            </SelectContent></Select><FormMessage /></FormItem>
                        )}/>

                        {offerType === 'product' && (
                             <FormField control={control} name="offerProductIds" render={() => (
                                <FormItem><FormLabel>Offered Products</FormLabel>
                                <ScrollArea className="h-40 rounded-md border"><div className="p-4">{brandProducts.map((p) => (<FormField key={p.id} control={control} name="offerProductIds" render={({ field }) => (<FormItem className="flex items-center space-x-2"><FormControl><Checkbox checked={field.value?.includes(p.id)} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), p.id]) : field.onChange((field.value || [])?.filter(id => id !== p.id))}/></FormControl><FormLabel className="font-normal text-sm">{p.productName}</FormLabel></FormItem>)}/>))}</div></ScrollArea><FormMessage/></FormItem>
                            )}/>
                        )}

                        {offerType === 'category' && (
                            <FormField control={control} name="offerCategoryIds" render={() => (
                                <FormItem><FormLabel>Offered Categories</FormLabel>
                                <ScrollArea className="h-40 rounded-md border"><div className="p-4">{brandCategories.map((c) => (<FormField key={c.id} control={control} name="offerCategoryIds" render={({ field }) => (<FormItem className="flex items-center space-x-2"><FormControl><Checkbox checked={field.value?.includes(c.id)} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), c.id]) : field.onChange((field.value || [])?.filter(id => id !== c.id))}/></FormControl><FormLabel className="font-normal text-sm">{c.categoryName}</FormLabel></FormItem>)}/>))}</div></ScrollArea><FormMessage/></FormItem>
                            )}/>
                        )}

                        <Separator/>

                        <div className="grid grid-cols-2 gap-4">
                             <FormField control={control} name="discountType" render={({ field }) => (
                                <FormItem><FormLabel>Discount Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a discount type" /></SelectTrigger></FormControl><SelectContent>
                                    <SelectItem value="none">No Discount</SelectItem>
                                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                                    <SelectItem value="fixed_amount">Fixed Amount (DKK)</SelectItem>
                                </SelectContent></Select><FormMessage /></FormItem>
                            )}/>
                            {discountType !== 'none' && (
                                <FormField control={control} name="discountValue" render={({ field }) => (
                                    <FormItem><FormLabel>Discount Value</FormLabel><FormControl><Input type="number" step="0.01" placeholder="e.g. 10" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )}/>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Trigger Conditions</CardTitle><CardDescription>Define when this upsell offer should be shown. The offer triggers if ANY of these conditions are met.</CardDescription></CardHeader>
                     <CardContent className="space-y-4">
                        {triggerFields.map((field, index) => {
                            const triggerType = watch(`triggerConditions.${index}.type`);
                            return (
                                <div key={field.id} className="p-4 border rounded-md relative space-y-4">
                                     <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6 text-destructive" onClick={() => removeTrigger(index)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={control} name={`triggerConditions.${index}.type`} render={({ field }) => (
                                            <FormItem><FormLabel>Trigger Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a trigger" /></SelectTrigger></FormControl><SelectContent>
                                                <SelectItem value="product_in_cart">Product in Cart</SelectItem>
                                                <SelectItem value="category_in_cart">Category in Cart</SelectItem>
                                                <SelectItem value="cart_value_over">Cart Value Over</SelectItem>
                                                <SelectItem value="combo_in_cart">Combo in Cart</SelectItem>
                                                <SelectItem value="product_tag_in_cart">Product Tag in Cart</SelectItem>
                                            </SelectContent></Select><FormMessage /></FormItem>
                                        )}/>
                                        {triggerType === 'product_in_cart' && (
                                            <FormField control={control} name={`triggerConditions.${index}.referenceId`} render={({ field }) => (
                                                <FormItem><FormLabel>Trigger Product</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger></FormControl><SelectContent>{brandProducts.map(p=><SelectItem key={p.id} value={p.id}>{p.productName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                                            )}/>
                                        )}
                                        {triggerType === 'category_in_cart' && (
                                            <FormField control={control} name={`triggerConditions.${index}.referenceId`} render={({ field }) => (
                                                <FormItem><FormLabel>Trigger Category</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger></FormControl><SelectContent>{brandCategories.map(c=><SelectItem key={c.id} value={c.id}>{c.categoryName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                                            )}/>
                                        )}
                                        {triggerType === 'cart_value_over' && (
                                            <FormField control={control} name={`triggerConditions.${index}.referenceId`} render={({ field }) => (
                                                <FormItem><FormLabel>Cart Value Threshold</FormLabel><FormControl><Input type="number" placeholder="100.00" {...field} /></FormControl><FormMessage /></FormItem>
                                            )}/>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                         <Button type="button" variant="outline" size="sm" onClick={() => appendTrigger({ id: crypto.randomUUID(), type: 'product_in_cart', referenceId: '' })}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Trigger
                        </Button>
                     </CardContent>
                </Card>
            </div>
            
            <div className="space-y-6">
                 <Card>
                    <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={control} name="isActive" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>Active</FormLabel><FormDescription>Is this upsell available?</FormDescription></div><FormControl><Switch name="isActive" checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                        )}/>
                        
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

                         <FormField control={control} name="tags" render={() => (
                            <FormItem>
                                <FormLabel>Tags</FormLabel>
                                <div className="flex gap-2 flex-wrap pt-2">
                                {UPSELL_TAGS.map(item => (
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

