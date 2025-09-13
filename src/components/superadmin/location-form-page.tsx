

'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { useEffect, useTransition, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';

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
import type { Location, Brand } from '@/types';
import { createOrUpdateLocation } from '@/app/superadmin/locations/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { countries } from '@/lib/countries';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
import { Switch } from '../ui/switch';


const openingHoursSchema = z.object({
  isOpen: z.boolean().default(false),
  open: z.string(),
  close: z.string(),
});

const locationSchema = z.object({
  id: z.string().optional(),
  brandId: z.string().min(1, { message: 'Brand is required.' }),
  name: z.string().min(2, { message: 'Location name must be at least 2 characters.' }),
  slug: z.string().min(2, { message: 'Slug is required.' }),
  street: z.string().min(2, 'Street name is required.'),
  zipCode: z.string().min(2, 'PO Box / ZIP Code is required.'),
  city: z.string().min(2, 'City is required.'),
  country: z.string().min(2, 'Country is required.'),
  isActive: z.boolean().default(false),
  deliveryFee: z.coerce.number().min(0, { message: 'Delivery fee must be a positive number.' }),
  minOrder: z.coerce.number().min(0, { message: 'Minimum order must be a positive number.' }),
  imageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  smileyUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  deliveryTypes: z.array(z.enum(['delivery', 'pickup'])).min(1, { message: 'At least one delivery type is required.' }),
  openingHours: z.object({
    monday: openingHoursSchema,
    tuesday: openingHoursSchema,
    wednesday: openingHoursSchema,
    thursday: openingHoursSchema,
    friday: openingHoursSchema,
    saturday: openingHoursSchema,
    sunday: openingHoursSchema,
  }),
  allowPreOrder: z.boolean().default(false),
  prep_time: z.coerce.number().min(0),
  delivery_time: z.coerce.number().min(0),
  travlhed_factor: z.enum(['normal', 'medium', 'høj']),
  manual_override: z.coerce.number().min(0).optional().default(0),
  pickupSaveTag: z.string().optional(),
});


type LocationFormValues = z.infer<typeof locationSchema>;

interface LocationFormPageProps {
  location?: Location;
  brands: Brand[];
}

const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function LocationFormPage({ location, brands }: LocationFormPageProps) {
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();


    const getDefaultOpeningHours = () => {
        const hours: any = {};
        daysOfWeek.forEach(day => {
            hours[day] = { isOpen: false, open: '09:00', close: '22:00' };
        });
        return hours;
    }

    const form = useForm<LocationFormValues>({
        resolver: zodResolver(locationSchema),
        defaultValues: location ? {
            ...location,
            isActive: location.isActive || false,
            allowPreOrder: location.allowPreOrder || false,
            deliveryTypes: location.deliveryTypes || [],
            openingHours: location.openingHours || getDefaultOpeningHours(),
            imageUrl: location.imageUrl || '',
            smileyUrl: location.smileyUrl || '',
            manual_override: location.manual_override || 0,
        } : {
            brandId: '',
            name: '',
            slug: '',
            street: '',
            zipCode: '',
            city: '',
            country: '',
            isActive: true,
            allowPreOrder: false,
            deliveryFee: undefined,
            minOrder: undefined,
            deliveryTypes: ['delivery', 'pickup'],
            openingHours: getDefaultOpeningHours(),
            imageUrl: '',
            smileyUrl: '',
            prep_time: 15,
            delivery_time: 20,
            travlhed_factor: 'normal',
            manual_override: 0,
        },
    });

    const { control, watch, setValue } = form;
    const openingHours = watch('openingHours');
    const imageUrl = watch('imageUrl');
    const selectedBrandId = watch('brandId');

    const selectedBrand = useMemo(() => {
        return brands.find(b => b.id === selectedBrandId);
    }, [selectedBrandId, brands]);

    const currencyLabel = selectedBrand ? `(${selectedBrand.currency})` : '';


    const handleApplyToAll = () => {
        const mondayHours = openingHours.monday;
        daysOfWeek.forEach(day => {
            if (day !== 'monday') {
                setValue(`openingHours.${day}.isOpen`, mondayHours.isOpen);
                setValue(`openingHours.${day}.open`, mondayHours.open);
                setValue(`openingHours.${day}.close`, mondayHours.close);
            }
        });
    };

    const onSubmit = (data: LocationFormValues) => {
        const formData = new FormData();
        
        Object.entries(data).forEach(([key, value]) => {
            if (key === 'openingHours') {
                Object.entries(value).forEach(([day, hours]) => {
                    Object.entries(hours).forEach(([hourKey, hourValue]) => {
                        formData.append(`openingHours.${day}.${hourKey}`, String(hourValue));
                    });
                });
            } else if (key === 'deliveryTypes' && Array.isArray(value)) {
                value.forEach(type => formData.append('deliveryTypes', type));
            } else if (value !== null && value !== undefined) {
                formData.append(key, String(value));
            }
        });


        startTransition(async () => {
            const result = await createOrUpdateLocation(null, formData);
            if (result?.error) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            } else {
                toast({ title: 'Success!', description: `Location ${location ? 'updated' : 'created'}.` });
            }
        });
    };
    
    const title = location ? 'Edit Location' : 'Create New Location';
    const description = location ? `Editing details for ${location.name}.` : 'Fill in the details for the new location.';
    
    const timeOptions = (start: number, end: number, step: number) => {
        const options = [];
        for (let i = start; i <= end; i += step) {
            options.push({ value: String(i), label: `${i} min` });
        }
        return options;
    }

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
                    <Link href="/superadmin/locations">Cancel</Link>
                </Button>
                <Button type="submit" disabled={isPending}>
                    {isPending ? <Loader2 className="animate-spin" /> : (location ? 'Save Changes' : 'Create Location')}
                </Button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Location Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField
                        control={form.control}
                        name="brandId"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Brand</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value} disabled={!!location}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a brand" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {brands.map((brand) => (
                                        <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormDescription>
                                Assign this location to a brand. Cannot be changed later.
                            </FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                        />

                        <FormField control={form.control} name="name" render={({ field }) => (
                            <FormItem><FormLabel>Location Name</FormLabel><FormControl><Input placeholder="Downtown" {...field} onChange={(e) => {
                            field.onChange(e);
                            const slug = e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
                            form.setValue('slug', slug);
                            }} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="slug" render={({ field }) => (
                            <FormItem><FormLabel>URL Slug</FormLabel><FormControl><Input placeholder="downtown" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        
                        <FormField control={form.control} name="imageUrl" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Location Image URL (Optional)</FormLabel>
                                <FormControl>
                                    <Input placeholder="https://example.com/image.webp" {...field} />
                                </FormControl>
                                {imageUrl && (
                                    <div className="mt-2 w-48 h-32 relative">
                                        <Image src={imageUrl} alt="Location Preview" fill className="object-cover rounded-md border" data-ai-hint="restaurant storefront"/>
                                    </div>
                                )}
                                <FormMessage />
                            </FormItem>
                        )} />
                        
                        <FormField control={form.control} name="smileyUrl" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Smiley URL (Optional)</FormLabel>
                                <FormControl>
                                    <Input placeholder="https://www.findsmiley.dk/..." {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Address</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="street" render={({ field }) => (
                                <FormItem><FormLabel>Street & No.</FormLabel><FormControl><Input placeholder="Main St 123" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="zipCode" render={({ field }) => (
                                <FormItem><FormLabel>PO Box / ZIP</FormLabel><FormControl><Input placeholder="12345" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="city" render={({ field }) => (
                                <FormItem><FormLabel>City</FormLabel><FormControl><Input placeholder="Anytown" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="country" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Country</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Select a country" /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            {countries.map((country) => (
                                                <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader>
                        <CardTitle>Opening Hours</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         {daysOfWeek.map((day, index) => (
                            <div key={day} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4">
                                <FormField
                                    control={control}
                                    name={`openingHours.${day}.isOpen`}
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                            <FormLabel className="capitalize font-normal">{day}</FormLabel>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={control}
                                    name={`openingHours.${day}.open`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <Input type="time" {...field} disabled={!openingHours[day]?.isOpen} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <span>-</span>
                                <FormField
                                    control={control}
                                    name={`openingHours.${day}.close`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <Input type="time" {...field} disabled={!openingHours[day]?.isOpen} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        ))}
                        <Separator />
                        <div className="flex items-center space-x-2">
                           <Button type="button" variant="outline" size="sm" onClick={handleApplyToAll}>Apply Monday's Hours to All</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
            {/* Right Column */}
            <div className="space-y-6">
                 <Card>
                    <CardHeader>
                        <CardTitle>Time Settings</CardTitle>
                        <CardDescription>Configuration for calculating pickup and delivery times.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={form.control} name="prep_time" render={({ field }) => (
                           <FormItem><FormLabel>Preparation Time</FormLabel>
                             <Select onValueChange={field.onChange} value={String(field.value)}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                               <SelectContent>{timeOptions(5, 60, 5).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                             </Select><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="delivery_time" render={({ field }) => (
                           <FormItem><FormLabel>Delivery Time</FormLabel>
                             <Select onValueChange={field.onChange} value={String(field.value)}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                               <SelectContent>{timeOptions(5, 60, 5).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                             </Select><FormMessage /></FormItem>
                        )} />
                        <FormField
                            control={form.control}
                            name="travlhed_factor"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Busyness Factor</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Select factor" /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="normal">Normal (+0 min)</SelectItem>
                                            <SelectItem value="medium">Medium (+10 min)</SelectItem>
                                            <SelectItem value="høj">High (+20 min)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField control={form.control} name="manual_override" render={({ field }) => (
                           <FormItem><FormLabel>Manual Time Override</FormLabel>
                             <Select onValueChange={field.onChange} value={String(field.value)}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                               <SelectContent>
                                 <SelectItem value="0">None</SelectItem>
                                 {timeOptions(15, 120, 15).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                               </SelectContent>
                             </Select><FormDescription>If set, this value overrides all other time calculations.</FormDescription><FormMessage /></FormItem>
                        )} />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <FormField
                            control={form.control}
                            name="isActive"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel className="text-base">Active</FormLabel>
                                    <FormDescription>
                                        Is this location currently accepting orders?
                                    </FormDescription>
                                </div>
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="allowPreOrder"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel className="text-base">Allow Pre-order</FormLabel>
                                    <FormDescription>
                                       Can customers place orders when closed?
                                    </FormDescription>
                                </div>
                                <FormControl>
                                    <Switch
                                        name="allowPreOrder"
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="deliveryTypes"
                            render={() => (
                                <FormItem>
                                    <div className="mb-4">
                                        <FormLabel className="text-base">Delivery Types</FormLabel>
                                        <FormDescription>
                                            Select the available fulfillment methods.
                                        </FormDescription>
                                    </div>
                                    <div className="flex flex-col space-y-2">
                                        {(['delivery', 'pickup'] as const).map((item) => (
                                            <FormField
                                            key={item}
                                            control={form.control}
                                            name="deliveryTypes"
                                            render={({ field }) => {
                                                return (
                                                <FormItem
                                                    key={item}
                                                    className="flex flex-row items-start space-x-3 space-y-0"
                                                >
                                                    <FormControl>
                                                    <Checkbox
                                                        checked={field.value?.includes(item)}
                                                        onCheckedChange={(checked) => {
                                                        return checked
                                                            ? field.onChange([...field.value, item])
                                                            : field.onChange(
                                                                field.value?.filter(
                                                                (value) => value !== item
                                                                )
                                                            )
                                                        }}
                                                    />
                                                    </FormControl>
                                                    <FormLabel className="font-normal capitalize">
                                                        {item}
                                                    </FormLabel>
                                                </FormItem>
                                                )
                                            }}
                                            />
                                        ))}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField control={form.control} name="deliveryFee" render={({ field }) => (
                            <FormItem><FormLabel>Delivery Fee {currencyLabel}</FormLabel><FormControl><Input type="number" step="0.5" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="minOrder" render={({ field }) => (
                            <FormItem><FormLabel>Min. Order {currencyLabel}</FormLabel><FormControl><Input type="number" step="1" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <Separator />
                        <FormField control={form.control} name="pickupSaveTag" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Pickup Save Tag</FormLabel>
                                <FormControl><Input placeholder="e.g. 15%" {...field} value={field.value ?? ''} /></FormControl>
                                <FormDescription>Optional text shown on the delivery method dialog (e.g., &quot;15%&quot;). It will be displayed as &quot;Save 15%&quot;.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </CardContent>
                </Card>
            </div>
        </div>
      </form>
    </Form>
  );
}

