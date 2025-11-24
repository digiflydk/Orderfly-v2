
'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { 
    saveBrandWebsiteMenuSettings, 
    saveBrandWebsiteMenuHero,
    type BrandWebsiteMenuSettingsInput, 
    type BrandWebsiteMenuHeroInput
} from '@/lib/superadmin/brand-website/menu-settings-actions';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import type { BrandWebsiteMenuSettings } from '@/lib/types/brandWebsite';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const brandWebsiteMenuHeroSchema = z.object({
  title: z.string().min(1, "Title is required."),
  subtitle: z.string().optional(),
  imageUrl: z.string().url({ message: "Must be a valid URL"}).optional().or(z.literal('')),
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
});

const menuSettingsSchema = z.object({
  gridLayout: z.coerce.number().refine(val => [2,3,4].includes(val), 'Invalid grid layout'),
  showPrice: z.boolean(),
  showDescription: z.boolean(),
  stickyCategories: z.boolean(),
  defaultLocationId: z.string().nullable().optional(),
  heroEnabled: z.boolean(),
  hero: brandWebsiteMenuHeroSchema.nullable().optional(),
}).superRefine((data, ctx) => {
    if (data.heroEnabled) {
        if (!data.hero?.title) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['hero.title'],
                message: 'Hero title is required when enabled.',
            });
        }
        if (!data.hero?.imageUrl) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['hero.imageUrl'],
                message: 'A valid background image URL is required when hero is enabled.',
            });
        } else {
            try {
                new URL(data.hero.imageUrl);
            } catch {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['hero.imageUrl'],
                    message: 'Must be a valid HTTP/HTTPS URL.',
                });
            }
        }
    }
});


type MenuSettingsFormValues = z.infer<typeof menuSettingsSchema>;

interface BrandWebsiteMenuSettingsFormProps {
  brandId: string;
  initialSettings: BrandWebsiteMenuSettings;
}

export function BrandWebsiteMenuSettingsForm({ brandId, initialSettings }: BrandWebsiteMenuSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<MenuSettingsFormValues>({
    resolver: zodResolver(menuSettingsSchema),
    defaultValues: {
      ...initialSettings,
      defaultLocationId: initialSettings.defaultLocationId || null,
      heroEnabled: !!initialSettings.hero,
      hero: initialSettings.hero || { title: '', subtitle: '', imageUrl: '', ctaLabel: '', ctaHref: '' },
    },
  });

  const watchHeroEnabled = form.watch('heroEnabled');

  const onSubmit = (data: MenuSettingsFormValues) => {
    startTransition(async () => {
      try {
        const { heroEnabled, hero, ...settings } = data;
        
        await Promise.all([
            saveBrandWebsiteMenuSettings(brandId, settings),
            saveBrandWebsiteMenuHero(brandId, heroEnabled ? hero : null)
        ]);

        toast({ title: 'Success', description: 'Menu settings saved successfully.' });
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save settings.' });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex justify-end mb-6">
             <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save All Menu Settings
            </Button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Layout & Display</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <FormField
                            control={form.control}
                            name="gridLayout"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Grid Layout</FormLabel>
                                <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select columns" />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                    <SelectItem value="2">2 Columns</SelectItem>
                                    <SelectItem value="3">3 Columns</SelectItem>
                                    <SelectItem value="4">4 Columns</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="showPrice"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <FormLabel>Show Price</FormLabel>
                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="showDescription"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <FormLabel>Show Description</FormLabel>
                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="stickyCategories"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <FormLabel>Sticky Categories</FormLabel>
                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
            </div>
            <div className="lg:col-span-2 space-y-6">
                 <Card>
                    <CardHeader>
                        <CardTitle>Menu Hero Section</CardTitle>
                        <CardDescription>Optional hero section displayed at the top of the menu page.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="heroEnabled"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel className="text-base">Enable Hero Section</FormLabel>
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
                        {watchHeroEnabled && (
                            <div className="space-y-4 pt-4 border-t">
                                <FormField control={form.control} name="hero.title" render={({ field }) => (
                                    <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="hero.subtitle" render={({ field }) => (
                                    <FormItem><FormLabel>Subtitle</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="hero.imageUrl" render={({ field }) => (
                                    <FormItem><FormLabel>Background Image URL</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField control={form.control} name="hero.ctaLabel" render={({ field }) => (
                                        <FormItem><FormLabel>CTA Button Label</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                    <FormField control={form.control} name="hero.ctaHref" render={({ field }) => (
                                        <FormItem><FormLabel>CTA Button Link</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
      </form>
    </Form>
  );
}
