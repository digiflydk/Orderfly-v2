

'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useEffect, useTransition } from 'react';
import Link from 'next/link';

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Brand, CookieTexts, LanguageSetting } from '@/types';
import { createOrUpdateCookieTexts } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const textsSchema = z.object({
  language: z.string().min(2, 'Language code is required.'),
  brand_id: z.string().optional(),
  banner_title: z.string().min(1),
  banner_description: z.string().min(1),
  accept_all_button: z.string().min(1),
  customize_button: z.string().min(1),
  modal_title: z.string().min(1),
  modal_description: z.string().min(1),
  save_preferences_button: z.string().min(1),
  modal_accept_all_button: z.string().min(1),
  cat_necessary_title: z.string().min(1),
  cat_necessary_desc: z.string().min(1),
  cat_functional_title: z.string().min(1),
  cat_functional_desc: z.string().min(1),
  cat_analytics_title: z.string().min(1),
  cat_analytics_desc: z.string().min(1),
  cat_performance_title: z.string().min(1),
  cat_performance_desc: z.string().min(1),
});

type TextsFormValues = z.infer<typeof textsSchema>;

interface CookieTextsFormPageProps {
  textSet?: CookieTexts | null;
  brands: Brand[];
  supportedLanguages: LanguageSetting[];
}

export function CookieTextsFormPage({ textSet, brands, supportedLanguages }: CookieTextsFormPageProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const form = useForm<TextsFormValues>({
    resolver: zodResolver(textsSchema),
    defaultValues: {
      language: 'da',
      brand_id: '',
      banner_title: '', banner_description: '', accept_all_button: '', customize_button: '',
      modal_title: '', modal_description: '', save_preferences_button: '', modal_accept_all_button: '',
      cat_necessary_title: '', cat_necessary_desc: '',
      cat_functional_title: '', cat_functional_desc: '',
      cat_analytics_title: '', cat_analytics_desc: '',
      cat_performance_title: '', cat_performance_desc: '',
    },
  });

  useEffect(() => {
    if (textSet) {
      form.reset({
        language: textSet.language,
        brand_id: textSet.brand_id || 'global',
        banner_title: textSet.banner_title,
        banner_description: textSet.banner_description,
        accept_all_button: textSet.accept_all_button,
        customize_button: textSet.customize_button,
        modal_title: textSet.modal_title,
        modal_description: textSet.modal_description,
        save_preferences_button: textSet.save_preferences_button,
        modal_accept_all_button: textSet.modal_accept_all_button,
        cat_necessary_title: textSet.categories.necessary.title,
        cat_necessary_desc: textSet.categories.necessary.description,
        cat_functional_title: textSet.categories.functional.title,
        cat_functional_desc: textSet.categories.functional.description,
        cat_analytics_title: textSet.categories.analytics.title,
        cat_analytics_desc: textSet.categories.analytics.description,
        cat_performance_title: textSet.categories.performance?.title || '',
        cat_performance_desc: textSet.categories.performance?.description || '',
      });
    }
  }, [textSet, form]);

  const handleFormSubmit = form.handleSubmit((data) => {
    const formData = new FormData();
    if(textSet?.id) formData.append('id', textSet.id);
    
    formData.append('consent_version', "1.0.59");

    // Flatten the data for FormData
    formData.append('language', data.language);
    if(data.brand_id && data.brand_id !== 'global') formData.append('brand_id', data.brand_id);
    formData.append('banner_title', data.banner_title);
    formData.append('banner_description', data.banner_description);
    formData.append('accept_all_button', data.accept_all_button);
    formData.append('customize_button', data.customize_button);
    formData.append('modal_title', data.modal_title);
    formData.append('modal_description', data.modal_description);
    formData.append('save_preferences_button', data.save_preferences_button);
    formData.append('modal_accept_all_button', data.modal_accept_all_button);
    
    // Nest category data
    formData.append('cat_necessary_title', data.cat_necessary_title);
    formData.append('cat_necessary_desc', data.cat_necessary_desc);
    formData.append('cat_functional_title', data.cat_functional_title);
    formData.append('cat_functional_desc', data.cat_functional_desc);
    formData.append('cat_analytics_title', data.cat_analytics_title);
    formData.append('cat_analytics_desc', data.cat_analytics_desc);
    formData.append('cat_performance_title', data.cat_performance_title);
    formData.append('cat_performance_desc', data.cat_performance_desc);
    
    startTransition(async () => {
        await createOrUpdateCookieTexts(formData);
    });
  });

  const title = textSet ? 'Edit Cookie Texts' : 'Create New Cookie Texts';
  const description = textSet ? `Editing texts for version ${textSet.consent_version}` : `Creating new texts for version 1.0.59`;


  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-muted-foreground">{description}</p>
            </div>
            <div className="flex gap-2">
                 <Button variant="outline" asChild>
                    <Link href="/superadmin/settings/cookie-texts">Cancel</Link>
                </Button>
                <Button onClick={handleFormSubmit} disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : (textSet ? 'Save Changes' : 'Create Texts')}</Button>
            </div>
        </div>
        <Form {...form}>
          <form onSubmit={handleFormSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="language" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Language</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select a language" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {supportedLanguages.map(lang => (
                                <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="brand_id" render={({ field }) => (<FormItem><FormLabel>Brand (Optional)</FormLabel><Select onValueChange={field.onChange} value={field.value || 'global'}><FormControl><SelectTrigger><SelectValue placeholder="Global" /></SelectTrigger></FormControl><SelectContent><SelectItem value="global">Global (Default)</SelectItem>{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            
            <Separator />
            <h3 className="text-lg font-semibold">Banner Texts</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="banner_title" render={({ field }) => (<FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="banner_description" render={({ field }) => (<FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="accept_all_button" render={({ field }) => (<FormItem><FormLabel>Accept All Button</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="customize_button" render={({ field }) => (<FormItem><FormLabel>Customize Button</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            </div>

            <Separator />
            <h3 className="text-lg font-semibold">Modal Texts</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="modal_title" render={({ field }) => (<FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="modal_description" render={({ field }) => (<FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="save_preferences_button" render={({ field }) => (<FormItem><FormLabel>Save Button</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="modal_accept_all_button" render={({ field }) => (<FormItem><FormLabel>Accept All Button</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            </div>
            
            <Separator />
            <h3 className="text-lg font-semibold">Category Texts</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 p-4 border rounded-md">
                    <FormField control={form.control} name="cat_necessary_title" render={({ field }) => (<FormItem><FormLabel>Necessary: Title</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="cat_necessary_desc" render={({ field }) => (<FormItem><FormLabel>Necessary: Description</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                </div>
                 <div className="space-y-4 p-4 border rounded-md">
                    <FormField control={form.control} name="cat_functional_title" render={({ field }) => (<FormItem><FormLabel>Functional: Title</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="cat_functional_desc" render={({ field }) => (<FormItem><FormLabel>Functional: Description</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                </div>
                 <div className="space-y-4 p-4 border rounded-md">
                    <FormField control={form.control} name="cat_analytics_title" render={({ field }) => (<FormItem><FormLabel>Analytics: Title</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="cat_analytics_desc" render={({ field }) => (<FormItem><FormLabel>Analytics: Description</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                </div>
                 <div className="space-y-4 p-4 border rounded-md">
                    <FormField control={form.control} name="cat_performance_title" render={({ field }) => (<FormItem><FormLabel>Performance: Title</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="cat_performance_desc" render={({ field }) => (<FormItem><FormLabel>Performance: Description</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                </div>
            </div>
          </form>
        </Form>
    </div>
  );
}
