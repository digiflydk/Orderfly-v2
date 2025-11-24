'use client';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { useTransition, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { debounce } from 'lodash';

import type { BrandWebsitePage } from '@/lib/types/brandWebsite';
import { brandWebsitePageCreateSchema } from '@/lib/superadmin/brand-website/pages-schemas';
import { createBrandWebsitePage, updateBrandWebsitePage } from '@/lib/superadmin/brand-website/pages-actions';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';

type PageFormValues = z.infer<typeof brandWebsitePageCreateSchema>;

interface BrandWebsitePageFormProps {
  brandId: string;
  page?: BrandWebsitePage;
}

export function BrandWebsitePageForm({ brandId, page }: BrandWebsitePageFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<PageFormValues>({
    resolver: zodResolver(brandWebsitePageCreateSchema),
    defaultValues: page || {
      slug: '',
      title: '',
      subtitle: '',
      layout: 'rich-text-left-image-right',
      body: '',
      imageUrl: '',
      isPublished: false,
      sortOrder: 0,
    },
  });

  const generateSlug = useCallback((name: string) => {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
  }, []);

  const debouncedSlugGeneration = useCallback(debounce((name: string) => {
    if (!form.getValues('slug')) {
        form.setValue('slug', generateSlug(name), { shouldValidate: true });
    }
  }, 500), [generateSlug, form]);

  const watchedTitle = form.watch('title');
  useEffect(() => {
    if (watchedTitle && !page) {
        debouncedSlugGeneration(watchedTitle);
    }
  }, [watchedTitle, page, debouncedSlugGeneration]);

  const onSubmit = (data: PageFormValues) => {
    startTransition(async () => {
      try {
        if (page) {
          await updateBrandWebsitePage(brandId, page.slug, data);
          toast({ title: 'Success', description: 'Page updated successfully.' });
          if(page.slug !== data.slug) {
            router.push(`/superadmin/brands/${brandId}/website/pages/${data.slug}`);
          }
        } else {
          await createBrandWebsitePage(brandId, data);
          toast({ title: 'Success', description: 'Page created successfully.' });
          router.push(`/superadmin/brands/${brandId}/website/pages`);
        }
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save page.' });
      }
    });
  };

  const title = page ? 'Edit Page' : 'Create New Page';
  const description = page ? `Editing details for page: "${page.title}"` : 'Fill out the form to create a new custom page.';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl><Input placeholder="About Us" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl><Input placeholder="about-us" {...field} /></FormControl>
                    <FormDescription>URL-friendly identifier for the page.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                    <FormDescription>Determines the order of the page in navigation lists.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
             <FormField
                control={form.control}
                name="isPublished"
                render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <FormLabel className="text-base">Published</FormLabel>
                        <FormDescription>
                            Is this page visible to the public?
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
                name="layout"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Layout</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                            <SelectContent><SelectItem value="rich-text-left-image-right">Text Left, Image Right</SelectItem></SelectContent>
                        </Select>
                        <FormMessage/>
                    </FormItem>
                )}
            />
            <FormField control={form.control} name="body" render={({ field }) => (
              <FormItem><FormLabel>Body Content</FormLabel><FormControl><Textarea rows={15} {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
          </CardContent>
          <CardFooter className="border-t px-6 py-4 justify-end gap-2">
            <Button type="button" variant="outline" asChild><Link href={`/superadmin/brands/${brandId}/website/pages`}>Cancel</Link></Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {page ? 'Save Changes' : 'Create Page'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
