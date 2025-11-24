
'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { saveBrandWebsiteLegal, type LegalInput } from '@/lib/superadmin/brand-website/config-actions';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

const legalFormSchema = z.object({
  usePlatformDefaults: z.boolean().optional(),
  customCookiePolicy: z.string().url().or(z.literal('')).optional(),
  customPrivacyPolicy: z.string().url().or(z.literal('')).optional(),
  customTerms: z.string().url().or(z.literal('')).optional(),
});

type LegalFormValues = z.infer<typeof legalFormSchema>;

interface BrandWebsiteLegalFormProps {
  brandId: string;
  initialLegalConfig: Partial<LegalInput>;
}

export function BrandWebsiteLegalForm({ brandId, initialLegalConfig }: BrandWebsiteLegalFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<LegalFormValues>({
    resolver: zodResolver(legalFormSchema),
    defaultValues: {
      usePlatformDefaults: initialLegalConfig.usePlatformDefaults ?? true,
      customCookiePolicy: initialLegalConfig.customCookiePolicy || '',
      customPrivacyPolicy: initialLegalConfig.customPrivacyPolicy || '',
      customTerms: initialLegalConfig.customTerms || '',
    },
  });

  const onSubmit = (data: LegalFormValues) => {
    startTransition(async () => {
      try {
        await saveBrandWebsiteLegal(brandId, data);
        toast({ title: 'Success', description: 'Legal settings saved successfully.' });
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save legal settings.' });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Legal & Compliance</CardTitle>
            <CardDescription>Manage links to legal documents like privacy policy and terms of service.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <FormField
                control={form.control}
                name="usePlatformDefaults"
                render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <FormLabel className="text-base">Use Platform Defaults</FormLabel>
                        <FormDescription>
                           If enabled, the website will use OrderFly's default legal pages.
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
            <FormField control={form.control} name="customCookiePolicy" render={({ field }) => (<FormItem><FormLabel>Custom Cookie Policy URL</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="customPrivacyPolicy" render={({ field }) => (<FormItem><FormLabel>Custom Privacy Policy URL</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="customTerms" render={({ field }) => (<FormItem><FormLabel>Custom Terms of Service URL</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)}/>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Legal Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
