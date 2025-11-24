
'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { saveBrandWebsiteSocial, type SocialInput } from '@/lib/superadmin/brand-website/config-actions';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

const socialFormSchema = z.object({
  facebook: z.string().url().or(z.literal('')).optional(),
  instagram: z.string().url().or(z.literal('')).optional(),
  tiktok: z.string().url().or(z.literal('')).optional(),
  linkedin: z.string().url().or(z.literal('')).optional(),
  x: z.string().url().or(z.literal('')).optional(),
  shareImageUrl: z.string().url({ message: "Must be a valid URL"}).or(z.literal('')).optional(),
});

type SocialFormValues = z.infer<typeof socialFormSchema>;

interface BrandWebsiteSocialFormProps {
  brandId: string;
  initialSocialConfig: Partial<SocialInput>;
}

export function BrandWebsiteSocialForm({ brandId, initialSocialConfig }: BrandWebsiteSocialFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<SocialFormValues>({
    resolver: zodResolver(socialFormSchema),
    defaultValues: {
      facebook: initialSocialConfig.facebook || '',
      instagram: initialSocialConfig.instagram || '',
      tiktok: initialSocialConfig.tiktok || '',
      linkedin: initialSocialConfig.linkedin || '',
      x: initialSocialConfig.x || '',
      shareImageUrl: initialSocialConfig.shareImageUrl || '',
    },
  });

  const onSubmit = (data: SocialFormValues) => {
    startTransition(async () => {
      try {
        await saveBrandWebsiteSocial(brandId, data);
        toast({ title: 'Success', description: 'Social media settings saved successfully.' });
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save social settings.' });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Social Media</CardTitle>
            <CardDescription>Manage social media links and default sharing image.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="shareImageUrl" render={({ field }) => (<FormItem><FormLabel>Default Social Share Image (og:image)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="facebook" render={({ field }) => (<FormItem><FormLabel>Facebook URL</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="instagram" render={({ field }) => (<FormItem><FormLabel>Instagram URL</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="tiktok" render={({ field }) => (<FormItem><FormLabel>TikTok URL</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="linkedin" render={({ field }) => (<FormItem><FormLabel>LinkedIn URL</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="x" render={({ field }) => (<FormItem><FormLabel>X (Twitter) URL</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)}/>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Social Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
