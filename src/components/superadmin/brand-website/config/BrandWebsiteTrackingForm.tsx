'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { saveBrandWebsiteTracking, type TrackingInput } from '@/lib/superadmin/brand-website/config-actions';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

const trackingFormSchema = z.object({
  ga4MeasurementId: z.string().optional(),
  gtmId: z.string().optional(),
  metaPixelId: z.string().optional(),
  tiktokPixelId: z.string().optional(),
  googleAdsConversionId: z.string().optional(),
});

type TrackingFormValues = z.infer<typeof trackingFormSchema>;

interface BrandWebsiteTrackingFormProps {
  brandId: string;
  initialTrackingConfig: Partial<TrackingInput>;
}

export function BrandWebsiteTrackingForm({ brandId, initialTrackingConfig }: BrandWebsiteTrackingFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<TrackingFormValues>({
    resolver: zodResolver(trackingFormSchema),
    defaultValues: {
      ga4MeasurementId: initialTrackingConfig.ga4MeasurementId || '',
      gtmId: initialTrackingConfig.gtmId || '',
      metaPixelId: initialTrackingConfig.metaPixelId || '',
      tiktokPixelId: initialTrackingConfig.tiktokPixelId || '',
      googleAdsConversionId: initialTrackingConfig.googleAdsConversionId || '',
    },
  });

  const onSubmit = (data: TrackingFormValues) => {
    startTransition(async () => {
      try {
        await saveBrandWebsiteTracking(brandId, data);
        toast({ title: 'Success', description: 'Tracking settings saved successfully.' });
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save tracking settings.' });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Tracking & Analytics</CardTitle>
            <CardDescription>Add tracking IDs for various analytics and advertising platforms.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="ga4MeasurementId" render={({ field }) => (<FormItem><FormLabel>GA4 Measurement ID</FormLabel><FormControl><Input placeholder="G-XXXXXXXXXX" {...field} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="gtmId" render={({ field }) => (<FormItem><FormLabel>Google Tag Manager ID</FormLabel><FormControl><Input placeholder="GTM-XXXXXXX" {...field} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="metaPixelId" render={({ field }) => (<FormItem><FormLabel>Meta (Facebook) Pixel ID</FormLabel><FormControl><Input placeholder="123456789012345" {...field} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="tiktokPixelId" render={({ field }) => (<FormItem><FormLabel>TikTok Pixel ID</FormLabel><FormControl><Input placeholder="C..." {...field} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="googleAdsConversionId" render={({ field }) => (<FormItem><FormLabel>Google Ads Conversion ID</FormLabel><FormControl><Input placeholder="AW-..." {...field} /></FormControl><FormMessage /></FormItem>)}/>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Tracking Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
