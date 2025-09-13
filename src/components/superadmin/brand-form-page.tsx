
'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useEffect, useTransition, useState, useCallback } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Brand, User, SubscriptionPlan, FoodCategory, BrandAppearances } from '@/types';
import { createOrUpdateBrand } from '@/app/superadmin/brands/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { countries } from '@/lib/countries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
import Link from 'next/link';
import { debounce } from 'lodash';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { BrandAppearancesForm } from './brand-appearances-form';

const brandSchema = z.object({
  id: z.string().optional(),
  
  ownerName: z.string().min(2, 'Owner name is required.'),
  ownerEmail: z.string().email('A valid email for the owner is required.'),

  companyName: z.string().min(2, 'Company name is required.'),
  name: z.string().min(2, 'Brand name must be at least 2 characters.'),
  slug: z.string().min(2, 'Brand slug is required.').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug can only contain lowercase letters, numbers, and hyphens.'),
  street: z.string().min(2, 'Street name is required.'),
  zipCode: z.string().min(2, 'PO Box / ZIP Code is required.'),
  city: z.string().min(2, 'City is required.'),
  country: z.string().min(2, 'Country is required.'),
  currency: z.string().min(3, 'Currency is required.'),
  companyRegNo: z.string().regex(/^\d{8}$/, 'Company Registration No. must be an 8-digit number.'),
  
  subscriptionPlanId: z.string().optional(),
  foodCategories: z.array(z.string()).optional().default([]),
  locationsCount: z.coerce.number().min(1, 'Number of locations is required.'),

  status: z.enum(['active', 'suspended', 'pending', 'trialing']),
  
  logoUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  supportEmail: z.string().email({ message: "Please enter a valid email." }).optional().or(z.literal('')),
  website: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  termsUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  privacyUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  offersHeading: z.string().optional().or(z.literal('')),
  combosHeading: z.string().optional().or(z.literal('')),
  
  bagFee: z.coerce.number().min(0).optional(),
  adminFeeType: z.enum(['fixed', 'percentage']).optional(),
  adminFee: z.coerce.number().min(0).optional(),
  vatPercentage: z.coerce.number().min(0).max(100).optional(),
  
  // Analytics overrides
  ga4MeasurementId: z.string().optional(),
  gtmContainerId: z.string().optional(),

  // Appearances is handled by its own form
  appearances: z.any().optional(),
});

type BrandFormValues = z.infer<typeof brandSchema>;

interface BrandFormPageProps {
  brand?: Brand;
  users: User[];
  plans: SubscriptionPlan[];
  foodCategories: FoodCategory[];
}

export function BrandFormPage({ brand, users, plans, foodCategories }: BrandFormPageProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  
  const form = useForm<BrandFormValues>({
    resolver: zodResolver(brandSchema),
    defaultValues: brand ? {
        ...brand,
        ownerName: users.find(u => u.id === brand.ownerId)?.name || '',
        ownerEmail: users.find(u => u.id === brand.ownerId)?.email || '',
        foodCategories: brand.foodCategories || [],
        logoUrl: brand.logoUrl || '',
        supportEmail: brand.supportEmail || '',
        website: brand.website || '',
        termsUrl: brand.termsUrl || '',
        privacyUrl: brand.privacyUrl || '',
        offersHeading: brand.offersHeading || '',
        combosHeading: brand.combosHeading || '',
    } : {
      ownerName: '',
      ownerEmail: '',
      companyName: '',
      name: '',
      slug: '',
      subscriptionPlanId: '',
      status: 'pending',
      street: '',
      zipCode: '',
      city: '',
      country: '',
      currency: '',
      companyRegNo: '',
      foodCategories: [],
      locationsCount: 1,
      logoUrl: '',
      supportEmail: '',
      website: '',
      termsUrl: '',
      privacyUrl: '',
      offersHeading: '',
      combosHeading: '',
    },
  });

  const generateSlug = useCallback((name: string) => {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
  }, []);
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSlugGeneration = useCallback(
    debounce((name) => {
        if (!form.getValues('slug')) {
             form.setValue('slug', generateSlug(name), { shouldValidate: true });
        }
    }, 500),
    [generateSlug, form]
  );
  
  const brandName = form.watch('name');
  const logoUrl = form.watch('logoUrl');
  const currencyList = [...new Set(countries.map(c => c.currency))].sort();

  useEffect(() => {
    if (brandName && !brand) {
        debouncedSlugGeneration(brandName);
    }
  }, [brandName, brand, debouncedSlugGeneration]);


  useEffect(() => {
    if (brand) {
        const owner = users.find(u => u.id === brand.ownerId);
        form.reset({
            ...brand,
            ownerName: owner?.name || '',
            ownerEmail: owner?.email || '',
            foodCategories: brand.foodCategories || [],
            logoUrl: brand.logoUrl || '',
            supportEmail: brand.supportEmail || '',
            website: brand.website || '',
            termsUrl: brand.termsUrl || '',
            privacyUrl: brand.privacyUrl || '',
            offersHeading: brand.offersHeading || '',
            combosHeading: brand.combosHeading || '',
        });
    }
  }, [brand, users, form]);
  
  const title = brand ? 'Edit Brand' : 'Create New Brand';
  const description = brand ? `Editing details for ${brand.name}.` : `Fill out the form to create a new brand.`;
  

  const onSubmit = (data: BrandFormValues) => {
    const formData = new FormData();

    for (const key in data) {
        const value = data[key as keyof typeof data];
        if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
                value.forEach(item => formData.append(key, item));
            } else if (typeof value !== 'object') {
                formData.append(key, String(value));
            }
        }
    }
    
    startTransition(async () => {
      const result = await createOrUpdateBrand(null, formData);
      if (result?.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      } else {
        toast({ title: 'Success!', description: `Brand ${brand ? 'updated' : 'created'} successfully.` });
      }
    });
  };

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-muted-foreground">{description}</p>
            </div>
             <Button asChild variant="outline"><Link href="/superadmin/brands">Back to Brands</Link></Button>
        </div>

        <Tabs defaultValue="details">
            <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                <TabsTrigger value="appearances" disabled={!brand}>Appearances</TabsTrigger>
            </TabsList>
            
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
            <TabsContent value="details" className="mt-6">
                <div className="flex justify-end mb-6">
                    <Button type="submit" disabled={isPending}>
                        {isPending ? <Loader2 className="animate-spin" /> : (brand ? 'Save Changes' : 'Create Brand')}
                    </Button>
                </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Company & Brand Information</CardTitle>
                                    <CardDescription>Legal and public-facing brand details.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="companyName"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>Company Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="The Good Food Company ApS" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                        />
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="name"
                                            render={({ field }) => (
                                                <FormItem>
                                                <FormLabel>Brand Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Esmeralda Pizza" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                            />
                                        <FormField
                                            control={form.control}
                                            name="slug"
                                            render={({ field }) => (
                                                <FormItem>
                                                <FormLabel>Brand Slug</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="esmeralda-pizza" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                            />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="street" render={({ field }) => (
                                            <FormItem><FormLabel>Street & No.</FormLabel><FormControl><Input placeholder="Pizza St 123" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="zipCode" render={({ field }) => (
                                            <FormItem><FormLabel>PO Box / ZIP</FormLabel><FormControl><Input placeholder="12345" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="city" render={({ field }) => (
                                            <FormItem><FormLabel>City</FormLabel><FormControl><Input placeholder="Anytown" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                         <FormField
                                            control={form.control}
                                            name="country"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Country</FormLabel>
                                                    <Select
                                                        onValueChange={(value) => {
                                                            const country = countries.find(c => c.code === value);
                                                            field.onChange(value);
                                                            if (country) {
                                                                form.setValue('currency', country.currency);
                                                            }
                                                        }}
                                                        value={field.value}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select a country" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {countries.map((country) => (
                                                                <SelectItem key={country.code} value={country.code}>
                                                                    {country.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="companyRegNo" render={({ field }) => (
                                            <FormItem><FormLabel>Company Reg. No.</FormLabel><FormControl><Input placeholder="12345678" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField
                                            control={form.control}
                                            name="currency"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Currency</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl><SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger></FormControl>
                                                        <SelectContent>
                                                            {currencyList.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Owner Information</CardTitle>
                                    <CardDescription>Details for the primary brand administrator.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="ownerName"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>Owner Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="John Doe" {...field} disabled={!!brand} />
                                            </FormControl>
                                            {brand && <FormDescription>Brand owner cannot be changed after creation.</FormDescription>}
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                        />
                                    <FormField
                                        control={form.control}
                                        name="ownerEmail"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>Owner Email</FormLabel>
                                            <FormControl>
                                                <Input type="email" placeholder="john.doe@example.com" {...field} disabled={!!brand} />
                                            </FormControl>
                                            {brand && <FormDescription>Brand owner cannot be changed after creation.</FormDescription>}
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                        />
                                </CardContent>
                            </Card>

                        </div>
                        
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Platform Configuration</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="status"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>Brand Status</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Set status" />
                                                </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="active">Active</SelectItem>
                                                    <SelectItem value="pending">Pending</SelectItem>
                                                    <SelectItem value="trialing">Trialing</SelectItem>
                                                    <SelectItem value="suspended">Suspended</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                        />
                                    <FormField control={form.control} name="locationsCount" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Number of Locations</FormLabel>
                                            <Select name={field.name} onValueChange={(val) => field.onChange(parseInt(val))} defaultValue={String(field.value)}>
                                                <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select number of locations" />
                                                </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {[...Array(100)].map((_, i) => (
                                                        <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField
                                        control={form.control}
                                        name="subscriptionPlanId"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>Subscription Plan</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value || ''} >
                                                <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a plan" />
                                                </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {plans.map((plan) => (
                                                        <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormDescription>Optional: Assign a subscription plan.</FormDescription>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Optional Details</CardTitle>
                                    <CardDescription>These details can be used to customize the customer-facing experience.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                     <FormField control={form.control} name="logoUrl" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Logo URL</FormLabel>
                                            <FormControl>
                                                <Input placeholder="https://example.com/logo.png" {...field} />
                                            </FormControl>
                                            {logoUrl && (
                                                <div className="mt-2 w-32 h-32 relative">
                                                    <Image src={logoUrl} alt="Logo Preview" fill className="object-contain rounded-md border" data-ai-hint="logo" />
                                                </div>
                                            )}
                                            <FormMessage />
                                        </FormItem>
                                        )} />
                                    <FormField control={form.control} name="supportEmail" render={({ field }) => (
                                        <FormItem><FormLabel>Support Email</FormLabel><FormControl><Input type="email" placeholder="support@brand.com" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={form.control} name="website" render={({ field }) => (
                                        <FormItem><FormLabel>Website URL</FormLabel><FormControl><Input placeholder="https://mybrand.com" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </CardContent>
                            </Card>
                        </div>
                    </div>
            </TabsContent>
            </form>
            </Form>
            
            <TabsContent value="settings" className="mt-6">
                 <Form {...form}>
                 <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="flex justify-end mb-6">
                            <Button type="submit" disabled={isPending}>
                                {isPending ? <Loader2 className="animate-spin" /> : (brand ? 'Save Settings' : 'Create Brand')}
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                             <div className="lg:col-span-2 space-y-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Legal & Links</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <FormField control={form.control} name="termsUrl" render={({ field }) => (
                                            <FormItem><FormLabel>Terms & Conditions URL</FormLabel><FormControl><Input placeholder="https://mybrand.com/terms" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="privacyUrl" render={({ field }) => (
                                            <FormItem><FormLabel>Privacy Policy URL</FormLabel><FormControl><Input placeholder="https://mybrand.com/privacy" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Custom Headings</CardTitle>
                                        <CardDescription>Override default headings on the menu page.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                         <FormField control={form.control} name="offersHeading" render={({ field }) => (
                                            <FormItem><FormLabel>Offers Heading</FormLabel><FormControl><Input placeholder="Offers" {...field} /></FormControl><FormDescription>Custom heading for the Offers section on the menu.</FormDescription><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="combosHeading" render={({ field }) => (
                                            <FormItem><FormLabel>Combos Heading</FormLabel><FormControl><Input placeholder="Combo Deals" {...field} /></FormControl><FormDescription>Custom heading for the Combos section on the menu.</FormDescription><FormMessage /></FormItem>
                                        )} />
                                    </CardContent>
                                </Card>
                            </div>
                            <div className="space-y-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Fees & VAT</CardTitle>
                                        <CardDescription>Define brand-specific fees and VAT.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <FormField control={form.control} name="bagFee" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Bag Fee (kr.)</FormLabel>
                                                <FormControl><Input type="number" step="0.01" placeholder="e.g. 4.00" {...field} value={field.value ?? ''} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="vatPercentage" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>VAT (%)</FormLabel>
                                                <FormControl><Input type="number" step="0.1" placeholder="e.g. 25" {...field} value={field.value ?? ''}/></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <Separator />
                                        <FormField control={form.control} name="adminFeeType" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Admin Fee Type</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="fixed">Fixed Amount (kr.)</SelectItem>
                                                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="adminFee" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Admin Fee Value</FormLabel>
                                                <FormControl><Input type="number" step="0.01" placeholder="e.g. 10 or 1.5" {...field} value={field.value ?? ''} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </form>
                 </Form>
            </TabsContent>

            <TabsContent value="analytics" className="mt-6">
                 <Form {...form}>
                 <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="flex justify-end mb-6">
                        <Button type="submit" disabled={isPending}>
                            {isPending ? <Loader2 className="animate-spin" /> : 'Save Analytics Settings'}
                        </Button>
                    </div>
                    <Card>
                        <CardHeader>
                            <CardTitle>Analytics Overrides</CardTitle>
                            <CardDescription>Optionally override global analytics settings for this brand.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <FormField control={form.control} name="ga4MeasurementId" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>GA4 Measurement ID</FormLabel>
                                    <FormControl><Input placeholder="G-XXXXXXXXXX" {...field} value={field.value ?? ''}/></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="gtmContainerId" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>GTM Container ID</FormLabel>
                                    <FormControl><Input placeholder="GTM-XXXXXXX" {...field} value={field.value ?? ''} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        </CardContent>
                    </Card>
                 </form>
                 </Form>
            </TabsContent>

            <TabsContent value="appearances" className="mt-6">
                {brand && <BrandAppearancesForm brand={brand} />}
            </TabsContent>
        </Tabs>
    </div>
  );
}
