
'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { saveBrandWebsiteHero } from '@/lib/superadmin/brand-website/home-actions';
import type { BrandWebsiteHome, BrandWebsiteHeroSlide } from '@/lib/types/brandWebsite';
import {
  brandWebsiteHomeSchema,
  brandWebsiteHeroSlideSchema,
} from '@/lib/superadmin/brand-website/home-schemas';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

type HomeFormValues = z.infer<typeof brandWebsiteHomeSchema>;

interface BrandWebsiteHomeFormProps {
  brandId: string;
  initialHomeConfig: BrandWebsiteHome;
}

export function BrandWebsiteHomeForm({ brandId, initialHomeConfig }: BrandWebsiteHomeFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<HomeFormValues>({
    resolver: zodResolver(brandWebsiteHomeSchema),
    defaultValues: initialHomeConfig,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'hero',
  });

  const onSubmit = (data: HomeFormValues) => {
    startTransition(async () => {
      try {
        await saveBrandWebsiteHero(brandId, data.hero);
        toast({ title: 'Success', description: 'Homepage hero section saved successfully.' });
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save settings.' });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Homepage Editor</CardTitle>
            <CardDescription>Manage the content for the homepage sections.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Hero Section</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="border p-4 rounded-md relative space-y-2">
                    <h4 className="font-semibold text-sm">Slide {index + 1}</h4>
                    <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <FormField control={form.control} name={`hero.${index}.title`} render={({ field }) => (
                      <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name={`hero.${index}.subtitle`} render={({ field }) => (
                      <FormItem><FormLabel>Subtitle</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                     <FormField control={form.control} name={`hero.${index}.body`} render={({ field }) => (
                      <FormItem><FormLabel>Body</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name={`hero.${index}.imageUrl`} render={({ field }) => (
                      <FormItem><FormLabel>Image URL</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => append({ id: `slide_${Date.now()}`, title: '', subtitle: '' })}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Hero Slide
                </Button>
              </CardContent>
            </Card>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Homepage
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
