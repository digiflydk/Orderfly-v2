'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { saveBrandWebsiteConfig, type SaveBrandWebsiteConfigInput } from '@/lib/superadmin/brand-website/config-actions';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';

const isHostname = (value: string) => {
    if (!value) return true; // Allow empty strings for optional fields initially
    try {
        const url = new URL(`http://${value}`);
        // Basic check: it has a TLD and no path/protocol
        return url.hostname === value && value.includes('.') && !value.includes('/') && !value.includes(':');
    } catch {
        return false;
    }
}

const configFormSchema = z.object({
  active: z.boolean(),
  template: z.string().min(1, "Template is required."),
  domains: z.array(z.string().refine(isHostname, "Must be a valid hostname (e.g., brand.com), without http/https.")).min(1, "At least one domain is required."),
  defaultLocationId: z.string().nullable(),
});

type ConfigFormValues = z.infer<typeof configFormSchema>;

interface BrandWebsiteConfigFormProps {
  brandId: string;
  initialConfig: BrandWebsiteConfig;
}

export function BrandWebsiteConfigForm({ brandId, initialConfig }: BrandWebsiteConfigFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configFormSchema),
    defaultValues: {
      active: initialConfig.active || false,
      template: initialConfig.template || 'template-1',
      domains: initialConfig.domains.length > 0 ? initialConfig.domains : [''],
      defaultLocationId: initialConfig.defaultLocationId || null,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'domains'
  });

  const onSubmit = (data: ConfigFormValues) => {
    startTransition(async () => {
      try {
        await saveBrandWebsiteConfig(brandId, {
            ...data,
            domains: data.domains.filter(d => d.trim() !== '')
        });
        toast({ title: 'Success', description: 'General settings saved successfully.' });
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save settings.' });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>Manage the core configuration for the brand website.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <FormLabel className="text-base">Website Active</FormLabel>
                        <FormDescription>
                            Enable or disable the public-facing brand website.
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
              name="template"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template</FormLabel>
                  <FormControl>
                    <Input {...field} disabled />
                  </FormControl>
                  <FormDescription>The template used for the website (currently locked).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormItem>
                <FormLabel>Domains</FormLabel>
                <FormDescription>Enter all domains associated with this brand website, including the primary one.</FormDescription>
                <div className="space-y-2">
                    {fields.map((field, index) => (
                         <FormField
                                key={field.id}
                                control={form.control}
                                name={`domains.${index}`}
                                render={({ field }) => (
                                   <FormItem>
                                        <div className="flex items-center gap-2">
                                            <FormControl>
                                                <Input placeholder="e.g., brand.com" {...field} />
                                            </FormControl>
                                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                    ))}
                </div>
                 <Button type="button" variant="outline" size="sm" onClick={() => append('')}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Domain
                </Button>
            </FormItem>

            <FormField
              control={form.control}
              name="defaultLocationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Location ID (Optional)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                   <FormDescription>The default location to use for "Order Now" links.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save General Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
