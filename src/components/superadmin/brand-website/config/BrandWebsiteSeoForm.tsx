'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { saveBrandWebsiteSeo, type SeoInput } from '@/lib/superadmin/brand-website/config-actions';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

const seoFormSchema = z.object({
  defaultTitle: z.string().optional(),
  defaultDescription: z.string().optional(),
  ogImageUrl: z.string().url().or(z.literal('')).optional(),
  canonicalUrl: z.string().url().or(z.literal('')).optional(),
  index: z.boolean().optional(),
});

type SeoFormValues = z.infer<typeof seoFormSchema>;

interface BrandWebsiteSeoFormProps {
  brandId: string;
  initialSeoConfig: Partial<SeoInput>;
}

export function BrandWebsiteSeoForm({ brandId, initialSeoConfig }: BrandWebsiteSeoFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<SeoFormValues>({
    resolver: zodResolver(seoFormSchema),
    defaultValues: {
      defaultTitle: initialSeoConfig.defaultTitle || '',
      defaultDescription: initialSeoConfig.defaultDescription || '',
      ogImageUrl: initialSeoConfig.ogImageUrl || '',
      canonicalUrl: initialSeoConfig.canonicalUrl || '',
      index: initialSeoConfig.index ?? true,
    },
  });

  const onSubmit = (data: SeoFormValues) => {
    startTransition(async () => {
      try {
        await saveBrandWebsiteSeo(brandId, data);
        toast({ title: 'Success', description: 'SEO settings saved successfully.' });
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save SEO settings.' });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>SEO Settings</CardTitle>
            <CardDescription>Manage default search engine optimization settings for the brand website.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="defaultTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default SEO Title</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Meta Description</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ogImageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Open Graph Image URL</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
                control={form.control}
                name="index"
                render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <FormLabel className="text-base">Allow Search Indexing</FormLabel>
                        <FormDescription>
                           Allow search engines to index this website.
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
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save SEO Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
