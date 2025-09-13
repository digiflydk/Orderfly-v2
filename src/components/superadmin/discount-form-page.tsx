

'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, PlusCircle, Trash2, Clock } from 'lucide-react';

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { Discount, Brand, Location, User } from '@/types';
import { createOrUpdateDiscount, type FormState } from '@/app/superadmin/discounts/actions';
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

const discountSchema = z.object({
  id: z.string().optional(),
  brandId: z.string().min(1, 'A brand must be selected.'),
  locationIds: z.array(z.string()).min(1, 'At least one location must be selected.'),
  code: z.string().min(3, 'Code must be at least 3 characters.').transform(v => v.toUpperCase()),
  description: z.string().optional(),
  discountType: z.enum(['percentage', 'fixed_amount']),
  discountValue: z.coerce.number().positive('Discount value must be positive.'),
  minOrderValue: z.coerce.number().min(0).optional(),
  isActive: z.boolean().default(true),
  orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type must be selected.'),
  activeDays: z.array(z.string()).optional().default([]),
  activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  usageLimit: z.coerce.number().min(0, 'Usage limit must be 0 or more.'),
  perCustomerLimit: z.coerce.number().min(0, 'Per customer limit must be 0 or more.'),
  assignedToCustomerId: z.string().optional(),
  firstTimeCustomerOnly: z.boolean().default(false),
  allowStacking: z.boolean().default(false),
});


type DiscountFormValues = z.infer<typeof discountSchema>;

interface DiscountFormPageProps {
  discount?: Discount;
  brands: Brand[];
  locations: Location[];
  users: User[];
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function DiscountFormPage({ discount, brands, locations, users }: DiscountFormPageProps) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const form = useForm<DiscountFormValues>({
        resolver: zodResolver(discountSchema),
        defaultValues: discount ? {
            ...discount,
            startDate: discount.startDate ? format(discount.startDate, 'yyyy-MM-dd') : undefined,
            endDate: discount.endDate ? format(discount.endDate, 'yyyy-MM-dd') : undefined,
            minOrderValue: discount.minOrderValue ?? 0,
            assignedToCustomerId: discount.assignedToCustomerId ?? undefined,
        } : {
            brandId: '',
            locationIds: [],
            code: '',
            description: '',
            discountType: 'percentage',
            discountValue: 0,
            minOrderValue: 0,
            isActive: true,
            orderTypes: ['pickup', 'delivery'],
            activeDays: WEEKDAYS,
            activeTimeSlots: [{start: '00:00', end: '23:59'}],
            usageLimit: 0,
            perCustomerLimit: 1,
            firstTimeCustomerOnly: false,
            allowStacking: false,
        },
    });

    const { control, watch, setValue, reset, formState } = form;

    const { fields: timeSlotFields, append: appendTimeSlot, remove: removeTimeSlot } = useFieldArray({
        control, name: "activeTimeSlots"
    });
    
    useEffect(() => {
        if (discount) {
            reset({
                ...discount,
                startDate: discount.startDate ? format(discount.startDate, 'yyyy-MM-dd') : undefined,
                endDate: discount.endDate ? format(discount.endDate, 'yyyy-MM-dd') : undefined,
                minOrderValue: discount.minOrderValue ?? undefined,
                assignedToCustomerId: discount.assignedToCustomerId ?? undefined,
            });
        }
    }, [discount, reset]);

    const selectedBrandId = watch('brandId');
    const assignedToCustomerId = watch('assignedToCustomerId');
    const firstTimeCustomerOnly = watch('firstTimeCustomerOnly');

    const availableLocations = useMemo(() => {
        if (!selectedBrandId) return [];
        return locations.filter(l => l.brandId === selectedBrandId);
    }, [selectedBrandId, locations]);

    const title = discount ? 'Edit Discount Code' : 'Create New Discount';
    const description = discount ? `Editing details for ${discount.code}.` : 'Fill in the details for the new discount.';

    const handleFormSubmit = form.handleSubmit((data) => {
        const formData = new FormData();

        Object.entries(data).forEach(([key, value]) => {
            if (key === 'activeTimeSlots' || value === undefined || value === null) return;
            if (Array.isArray(value)) {
                value.forEach(item => formData.append(key, String(item)));
            } else {
                formData.append(key, String(value));
            }
        });
        
        formData.append('activeTimeSlots', JSON.stringify(data.activeTimeSlots));

        startTransition(async () => {
            const result = await createOrUpdateDiscount(null, formData);
             if (result?.error) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
                 if (result.errors) {
                    result.errors.forEach(error => {
                        form.setError(error.path.join('.') as any, { message: error.message });
                    });
                }
            } else if (result?.message) {
                 toast({ title: 'Success!', description: result.message });
            }
        });
    });


  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit} className="space-y-6">
        {discount?.id && <input type="hidden" name="id" value={discount.id} />}
        <div className="flex items-center justify-between">
            <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="text-muted-foreground">{description}</p></div>
            <div className="flex gap-2"><Button type="button" variant="outline" asChild><Link href="/superadmin/discounts">Cancel</Link></Button><Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : (discount ? 'Save Changes' : 'Create Discount')}</Button></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader><CardTitle>Core Details</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={control} name="brandId" render={({ field }) => (
                            <FormItem><FormLabel>Brand</FormLabel><Select onValueChange={field.onChange} value={field.value} defaultValue={field.value} disabled={!!discount}><FormControl><SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger></FormControl><SelectContent>{brands.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
                        )}/>
                        
                        <FormField control={control} name="locationIds"
                            render={() => (
                                <FormItem>
                                <FormLabel>Locations</FormLabel>
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

                        <FormField control={control} name="code" render={({ field }) => (
                            <FormItem><FormLabel>Discount Code</FormLabel><FormControl><Input placeholder="e.g., SUMMER10" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={control} name="description" render={({ field }) => (
                            <FormItem><FormLabel>Description (Admin only)</FormLabel><FormControl><Textarea placeholder="Internal description for this discount." {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader><CardTitle>Discount Value & Rules</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                             <FormField control={control} name="discountType" render={({ field }) => (
                                <FormItem><FormLabel>Discount Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger></FormControl><SelectContent>
                                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                                    <SelectItem value="fixed_amount">Fixed Amount (DKK)</SelectItem>
                                </SelectContent></Select><FormMessage /></FormItem>
                            )}/>
                            <FormField control={control} name="discountValue" render={({ field }) => (
                                <FormItem><FormLabel>Discount Value</FormLabel><FormControl><Input type="number" step="0.01" placeholder="e.g. 10 or 50" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                        </div>
                         <FormField control={control} name="minOrderValue" render={({ field }) => (
                            <FormItem><FormLabel>Minimum Order Value (Optional)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="e.g. 200" {...field} /></FormControl><FormDescription>The cart total must be over this amount.</FormDescription><FormMessage /></FormItem>
                        )}/>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Customer Restrictions</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={control} name="assignedToCustomerId" render={({ field }) => (
                            <FormItem><FormLabel>Specific Customer (Optional)</FormLabel><Select onValueChange={field.onChange} value={field.value || ''} disabled={firstTimeCustomerOnly}><FormControl><SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger></FormControl><SelectContent>{users.map(u=><SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>)}</SelectContent></Select><FormDescription>If set, only this customer can use the code.</FormDescription><FormMessage /></FormItem>
                        )}/>
                         <FormField control={control} name="firstTimeCustomerOnly" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>First-Time Customers Only</FormLabel><FormDescription>Can only be used if the customer has no previous orders.</FormDescription></div><FormControl><Switch name="firstTimeCustomerOnly" checked={field.value} onCheckedChange={(val) => {if(val) setValue('assignedToCustomerId', undefined); field.onChange(val);}} disabled={!!assignedToCustomerId} /></FormControl></FormItem>
                        )}/>
                    </CardContent>
                </Card>

            </div>
            
            <div className="space-y-6">
                 <Card>
                    <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={control} name="isActive" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>Active</FormLabel></div><FormControl><Switch name="isActive" checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                        )}/>
                        <FormField control={control} name="allowStacking" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>Allow Stacking</FormLabel></div><FormControl><Switch name="allowStacking" checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                        )}/>
                        <Separator/>
                        <FormField control={control} name="usageLimit" render={({ field }) => (
                            <FormItem><FormLabel>Total Usage Limit</FormLabel><FormControl><Input type="number" placeholder="100" {...field} /></FormControl><FormDescription>0 for unlimited.</FormDescription><FormMessage /></FormItem>
                        )}/>
                         <FormField control={control} name="perCustomerLimit" render={({ field }) => (
                            <FormItem><FormLabel>Per Customer Limit</FormLabel><FormControl><Input type="number" placeholder="1" {...field} /></FormControl><FormDescription>0 for unlimited.</FormDescription><FormMessage /></FormItem>
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
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader><CardTitle>Date & Time Availability</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                         <FormField control={control} name="activeDays" render={() => (
                            <FormItem>
                                <FormLabel>Active Weekdays</FormLabel>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-2">
                                {WEEKDAYS.map(day => (
                                    <FormField key={day} control={control} name="activeDays" render={({ field }) => (
                                        <FormItem key={day} className="flex items-center space-x-2"><FormControl><Checkbox name={field.name} checked={field.value?.includes(day)} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), day]) : field.onChange((field.value || [])?.filter(v => v !== day))}/></FormControl><FormLabel className="font-normal capitalize text-sm">{day}</FormLabel></FormItem>
                                    )}/>
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
                             <FormItem className="flex flex-col"><FormLabel>Start Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(new Date(field.value), "PPP") : <span>Pick a date</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value ? new Date(field.value) : undefined} onSelect={(date) => field.onChange(date?.toISOString().split('T')[0])} /></PopoverContent></Popover><FormMessage /></FormItem>
                        )}/>
                        <FormField control={control} name="endDate" render={({ field }) => (
                            <FormItem className="flex flex-col"><FormLabel>End Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(new Date(field.value), "PPP") : <span>Pick a date</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value ? new Date(field.value) : undefined} onSelect={(date) => field.onChange(date?.toISOString().split('T')[0])} /></PopoverContent></Popover><FormMessage /></FormItem>
                        )}/>
                    </CardContent>
                </Card>
            </div>
        </div>
      </form>
    </Form>
  );
}
