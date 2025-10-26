
'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { useEffect, useMemo, useState, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { debounce } from 'lodash';

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
import type { Product, Brand, Location, Category, ToppingGroup, Allergen } from '@/types';
import { createOrUpdateProduct } from '@/app/superadmin/products/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { BrandAppearancesForm } from './brand-appearances-form';

const productSchema = z.object({
  id: z.string().optional().nullable(),
  brandId: z.string().min(1, 'A brand must be selected.'),
  locationIds: z.array(z.string()).optional().default([]),
  categoryId: z.string().min(1, 'A category must be selected.'),
  productName: z.string().min(2, 'Product name must be at least 2 characters.'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'Price must be a non-negative number.'),
  priceDelivery: z.coerce.number().min(0, 'Delivery price must be a non-negative number.').optional(),
  isActive: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  isNew: z.boolean().default(false),
  isPopular: z.boolean().default(false),
  allergenIds: z.array(z.string()).optional().default([]),
  toppingGroupIds: z.array(z.string()).optional().default([]),
  imageUrl: z.any().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormPageProps {
  product?: Product;
  brands: Brand[];
  locations: Location[];
  categories: Category[];
  toppingGroups: ToppingGroup[];
  allergens: Allergen[];
}

function SubmitButton({ isEditing }: { isEditing: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : (isEditing ? 'Save Changes' : 'Create Product')}
        </Button>
    )
}

export function ProductFormPage({ product, brands, locations, categories, toppingGroups, allergens }: ProductFormPageProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(product?.imageUrl || null);
  const [isClient, setIsClient] = useState(false);

  const isEditing = !!product;

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    mode: "onSubmit",
    defaultValues: {
      id: product?.id ?? "",
      brandId: product?.brandId ?? "",
      categoryId: product?.categoryId ?? "",
      productName: product?.productName ?? "",
      description: product?.description ?? "",
      price: (product?.price ?? "") as unknown as number,
      priceDelivery: (product?.priceDelivery ?? "") as unknown as number,
      isActive: product?.isActive ?? false,
      isFeatured: product?.isFeatured ?? false,
      isNew: product?.isNew ?? false,
      isPopular: product?.isPopular ?? false,
      locationIds: product?.locationIds ?? [],
      allergenIds: product?.allergenIds ?? [],
      toppingGroupIds: product?.toppingGroupIds ?? [],
      imageUrl: product?.imageUrl ?? undefined,
    },
  });

  const selectedBrandId = form.watch('brandId');
  const imageUrlValue = form.watch('imageUrl');

  const { brandLocations, brandCategories, brandToppingGroups } = useMemo(() => {
    if (!selectedBrandId) {
        return { brandLocations: [], brandCategories: [], brandToppingGroups: [] };
    }
    const brandLocationIds = new Set(locations.filter(l => l.brandId === selectedBrandId).map(l => l.id));

    const categoriesForBrand = categories.filter(c => 
        c.locationIds.some(locId => brandLocationIds.has(locId))
    );
    const toppingGroupsForBrand = toppingGroups.filter(tg => 
        tg.locationIds.some(locId => brandLocationIds.has(locId))
    );

    return { brandLocations: locations.filter(l => l.brandId === selectedBrandId), brandCategories: categoriesForBrand, brandToppingGroups: toppingGroupsForBrand };
  }, [selectedBrandId, locations, categories, toppingGroups]);
  
  useEffect(() => {
    const currentCategoryId = form.getValues('categoryId');
    if (currentCategoryId && !brandCategories.some(c => c.id === currentCategoryId)) {
        form.setValue('categoryId', '');
    }
  }, [selectedBrandId, brandCategories, form]);

  useEffect(() => {
      setIsClient(true);
  }, []);
  
  const title = isEditing ? 'Edit Product' : 'Create New Product';
  const description = isEditing ? `Editing details for ${product?.productName || 'product...'}.` : 'Fill in the details for the new product.';
  
  return (
    <div className="space-y-6">
        <Form {...form}>
            <form action={createOrUpdateProduct}>
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                        <p className="text-muted-foreground">{description}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href="/superadmin/products">Cancel</Link>
                        </Button>
                        <SubmitButton isEditing={isEditing} />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                         <Card>
                            <CardHeader>
                                <CardTitle>Core Details</CardTitle>
                                <CardDescription>Public-facing product information.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <FormField control={form.control} name="brandId" render={({ field }) => (
                                    <FormItem><FormLabel>Brand</FormLabel><Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isEditing}><FormControl><SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger></FormControl><SelectContent>{brands.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent></Select>{isEditing && <FormDescription>Product's brand cannot be changed after creation.</FormDescription>}<FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="productName" render={({ field }) => (
                                    <FormItem><FormLabel>Product Name</FormLabel><FormControl><Input placeholder="e.g., Margherita Pizza" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="description" render={({ field }) => (
                                    <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="A short, tasty description." {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem>
                                )} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField control={form.control} name="categoryId" render={({ field }) => (
                                        <FormItem><FormLabel>Category</FormLabel><Select onValueChange={field.onChange} value={field.value ?? ''} disabled={!selectedBrandId}><FormControl><SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger></FormControl><SelectContent>{brandCategories.map((c) => (<SelectItem key={c.id} value={c.id}>{c.categoryName}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={form.control} name="price" render={({ field }) => (
                                        <FormItem><FormLabel>Price (Pickup)</FormLabel><FormControl><Input type="number" inputMode="decimal" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}/></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField control={form.control} name="priceDelivery" render={({ field }) => (
                                        <FormItem><FormLabel>Price (Delivery)</FormLabel><FormControl><Input type="number" inputMode="decimal" step="0.01" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === "" ? "" : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                                <FormItem>
                                    <FormLabel>Product Image</FormLabel>
                                    <FormControl>
                                        <Input name="imageUrl" type="file" accept="image/*" onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    setImagePreview(reader.result as string);
                                                };
                                                reader.readAsDataURL(file);
                                            } else {
                                                setImagePreview(product?.imageUrl || null);
                                            }
                                        }} />
                                    </FormControl>
                                    {imagePreview && (
                                        <div className="mt-2 w-32 h-32 relative">
                                            <Image src={imagePreview} alt="Image Preview" fill className="object-contain rounded-md border" />
                                        </div>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle>Associations</CardTitle><CardDescription>Link this product to locations, allergens, and toppings.</CardDescription></CardHeader>
                            <CardContent className="space-y-6">
                                <FormField control={form.control} name="locationIds" render={() => (
                                    <FormItem>
                                        <FormLabel>Available at Locations</FormLabel>
                                        <FormDescription>Select locations where this product is sold. If none selected, it's available at all brand locations.</FormDescription>
                                        <ScrollArea className="h-40 rounded-md border"><div className="p-4">{brandLocations.map((item) => (<FormField key={item.id} control={form.control} name="locationIds" render={({ field }) => (<FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0 mb-2"><FormControl><Checkbox checked={!!field.value?.includes(item.id)} onCheckedChange={(checked) => {return checked ? field.onChange([...(field.value || []), item.id]) : field.onChange(field.value?.filter((value) => value !== item.id))}}/></FormControl><FormLabel className="font-normal">{item.name}</FormLabel></FormItem>)}/>))}</div></ScrollArea>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="allergenIds" render={() => (
                                    <FormItem>
                                        <FormLabel>Allergens</FormLabel>
                                        <ScrollArea className="h-40 rounded-md border"><div className="p-4">{allergens.filter(a => a.isActive).map((item) => (<FormField key={item.id} control={form.control} name="allergenIds" render={({ field }) => (<FormItem className="flex flex-row items-start space-x-3 space-y-0 mb-2"><FormControl><Checkbox checked={!!field.value?.includes(item.id)} onCheckedChange={(checked) => ( checked ? field.onChange([...(field.value || []), item.id]) : field.onChange(field.value?.filter((value) => value !== item.id)))}/></FormControl><FormLabel className="font-normal">{item.allergenName}</FormLabel></FormItem>)}/>))}</div></ScrollArea>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="toppingGroupIds" render={() => (
                                    <FormItem>
                                        <FormLabel>Topping Groups</FormLabel>
                                        <ScrollArea className="h-40 rounded-md border"><div className="p-4">{brandToppingGroups.map((item) => (<FormField key={item.id} control={form.control} name="toppingGroupIds" render={({ field }) => (<FormItem className="flex flex-row items-start space-x-3 space-y-0 mb-2"><FormControl><Checkbox checked={!!field.value?.includes(item.id)} onCheckedChange={(checked) => ( checked ? field.onChange([...(field.value || []), item.id]) : field.onChange(field.value?.filter((value) => value !== item.id)))}/></FormControl><FormLabel className="font-normal">{item.groupName}</FormLabel></FormItem>)}/>))}</div></ScrollArea>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="space-y-6">
                        <Card>
                            <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <FormField control={form.control} name="isActive" render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>Active</FormLabel></div><FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                                )}/>
                                <FormField control={form.control} name="isFeatured" render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>Featured</FormLabel></div><FormControl><Switch checked={!!field.value} onCheckedChange={(checked) => { field.onChange(checked); if (checked) { form.setValue('isNew', false); form.setValue('isPopular', false); } }} /></FormControl></FormItem>
                                )}/>
                                <FormField control={form.control} name="isNew" render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>New Product</FormLabel></div><FormControl><Switch checked={!!field.value} onCheckedChange={(checked) => { field.onChange(checked); if (checked) { form.setValue('isFeatured', false); form.setValue('isPopular', false); } }} /></FormControl></FormItem>
                                )}/>
                                <FormField control={form.control} name="isPopular" render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>Popular Product</FormLabel></div><FormControl><Switch checked={!!field.value} onCheckedChange={(checked) => { field.onChange(checked); if (checked) { form.setValue('isFeatured', false); form.setValue('isNew', false); } }} /></FormControl></FormItem>
                                )}/>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                 {/* Hidden serialization so the Server Action receives complete FormData */}
                <input type="hidden" name="id" value={form.watch('id') ?? ''} />
                <input type="hidden" name="brandId" value={form.watch('brandId') ?? ''} />
                <input type="hidden" name="categoryId" value={form.watch('categoryId') ?? ''} />
                <input type="hidden" name="productName" value={form.watch('productName') ?? ''} />
                <input type="hidden" name="description" value={form.watch('description') ?? ''} />
                <input type="hidden" name="price" value={(form.watch('price') ?? '').toString()} />
                <input type="hidden" name="priceDelivery" value={(form.watch('priceDelivery') ?? '').toString()} />
                <input type="hidden" name="isActive" value={form.watch('isActive') ? '1' : '0'} />
                <input type="hidden" name="isFeatured" value={form.watch('isFeatured') ? '1' : '0'} />
                <input type="hidden" name="isNew" value={form.watch('isNew') ? '1' : '0'} />
                <input type="hidden" name="isPopular" value={form.watch('isPopular') ? '1' : '0'} />
                {(form.watch('locationIds') ?? []).map((id: string) => (
                    <input key={`loc-hidden-${id}`} type="hidden" name="locationIds" value={id} />
                ))}
                {(form.watch('allergenIds') ?? []).map((id: string) => (
                    <input key={`alg-hidden-${id}`} type="hidden" name="allergenIds" value={id} />
                ))}
                {(form.watch('toppingGroupIds') ?? []).map((id: string) => (
                    <input key={`tg-hidden-${id}`} type="hidden" name="toppingGroupIds" value={id} />
                ))}
            </form>
        </Form>
    </div>
  );
}

    