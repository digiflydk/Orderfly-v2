
'use client';

import { useEffect, useState, useTransition, useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { updateAnalyticsSettings, updatePaymentGatewaySettings, updateLanguageSettings, updateBrandingSettings, type FormState } from '@/app/superadmin/settings/actions';
import type { AnalyticsSettings, PaymentGatewaySettings, LanguageSettings, LanguageSetting, PlatformBrandingSettings } from '@/types';
import { Loader2, Copy, Trash2, Cookie } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useFieldArray, useForm, FormProvider } from 'react-hook-form';
import Link from 'next/link';
import Image from 'next/image';


interface SettingsFormProps {
  initialAnalyticsSettings: AnalyticsSettings;
  initialPaymentGatewaySettings: PaymentGatewaySettings;
  initialLanguageSettings: LanguageSettings;
  initialBrandingSettings: PlatformBrandingSettings | null;
}

function SubmitButton({ children, pending }: { children: React.ReactNode, pending?: boolean }) {
    return <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : children}</Button>;
}


function LanguageSettingsForm({ initialSettings }: { initialSettings: LanguageSettings }) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const form = useForm({
        defaultValues: initialSettings
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "supportedLanguages",
    });
    
    const handleFormSubmit = form.handleSubmit((data) => {
        const formData = new FormData();
        formData.append('supportedLanguages', JSON.stringify(data.supportedLanguages));

        startTransition(async () => {
            const result = await updateLanguageSettings(null, formData);
            if(result.error) {
                toast({variant: 'destructive', title: "Error", description: result.message});
            } else {
                toast({title: "Success", description: result.message});
            }
        })
    });

    return (
        <FormProvider {...form}>
            <form onSubmit={handleFormSubmit}>
                <Card>
                    <CardHeader>
                        <CardTitle>Language Settings</CardTitle>
                        <CardDescription>
                        Manage the languages supported across the platform.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {fields.map((field, index) => (
                            <div key={field.id} className="flex items-end gap-2">
                                <Input {...form.register(`supportedLanguages.${index}.name`)} placeholder="Language Name (e.g., English)" />
                                <Input {...form.register(`supportedLanguages.${index}.code`)} placeholder="Code (e.g., en)" className="w-24"/>
                                <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ code: '', name: '' })}>
                            Add Language
                        </Button>
                    </CardContent>
                    <CardFooter className="border-t px-6 py-4">
                        <SubmitButton pending={isPending}>Save Language Settings</SubmitButton>
                    </CardFooter>
                </Card>
            </form>
        </FormProvider>
    )
}

function BrandingSettingsForm({ initialSettings }: { initialSettings: PlatformBrandingSettings | null }) {
  const [state, formAction] = useActionState(updateBrandingSettings, null);
  const { toast } = useToast();

  useEffect(() => {
    if (state?.message) {
      if (state.error) {
        toast({ variant: 'destructive', title: 'Error', description: state.message });
      } else {
        toast({ title: 'Success!', description: state.message });
      }
    }
  }, [state, toast]);

  return (
      <form action={formAction}>
          <Card>
              <CardHeader>
                  <CardTitle>Platform Branding</CardTitle>
                  <CardDescription>Manage the main logo, favicon, and browser heading for the platform.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="space-y-2">
                      <Label htmlFor="platformLogoUrl">Platform Logo URL</Label>
                      <Input id="platformLogoUrl" name="platformLogoUrl" placeholder="https://example.com/logo.png" defaultValue={initialSettings?.platformLogoUrl || ''} />
                      {initialSettings?.platformLogoUrl && <Image src={initialSettings.platformLogoUrl} alt="Logo Preview" width={120} height={40} className="mt-2 rounded-md border p-2 object-contain" data-ai-hint="logo" />}
                  </div>
                   <div className="space-y-2">
                      <Label htmlFor="platformFaviconUrl">Platform Favicon URL</Label>
                      <Input id="platformFaviconUrl" name="platformFaviconUrl" placeholder="https://example.com/favicon.ico" defaultValue={initialSettings?.platformFaviconUrl || ''} />
                      {initialSettings?.platformFaviconUrl?.startsWith('https://') && (
                          <Image src={initialSettings.platformFaviconUrl} alt="Favicon Preview" width={32} height={32} className="mt-2 rounded-md border p-1 object-contain" data-ai-hint="favicon"/>
                      )}
                      <p className="text-sm text-muted-foreground">
                          Recommended: <code>.ico</code>, <code>.png</code> or <code>.svg</code> in 16×16, 32×32 or 48×48 px. Empty field is allowed. Only <code>https</code> is accepted.
                      </p>
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="platformHeading">Browser Heading (tab title)</Label>
                      <Input id="platformHeading" name="platformHeading" placeholder="OrderFly" defaultValue={initialSettings?.platformHeading || 'OrderFly'} />
                      <p className="text-sm text-muted-foreground">
                        This is the browser title (tab text) - not a general headline in the UI.
                      </p>
                  </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                  <SubmitButton>Save Branding Settings</SubmitButton>
              </CardFooter>
          </Card>
      </form>
  )
}

export function SettingsForm({ initialAnalyticsSettings, initialPaymentGatewaySettings, initialLanguageSettings, initialBrandingSettings }: SettingsFormProps) {
  const { toast } = useToast();
  const [activePaymentTab, setActivePaymentTab] = useState(initialPaymentGatewaySettings.activeMode || 'test');
  const [origin, setOrigin] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const handleAnalyticsSubmit = (formData: FormData) => {
    startTransition(async () => {
        const result = await updateAnalyticsSettings(null, formData);
        if (result.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success!', description: result.message });
        }
    });
  };

  const handlePaymentSubmit = (formData: FormData) => {
    startTransition(async () => {
        // Ensure the active tab state is included in the form data
        formData.append('activeMode', activePaymentTab);
        const result = await updatePaymentGatewaySettings(null, formData);
        if (result.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success!', description: result.message });
        }
    });
  };
  
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
        title: "Copied!",
        description: "Webhook URL copied to clipboard.",
    });
  }

  const webhookUrl = origin ? `${origin}/api/stripe/webhook` : "Loading webhook URL...";

  return (
     <Tabs defaultValue="branding" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="payments">Payment Gateway</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="languages">Languages</TabsTrigger>
            <TabsTrigger value="cookies">Cookie Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="mt-6">
            <BrandingSettingsForm initialSettings={initialBrandingSettings} />
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
             <form action={handlePaymentSubmit}>
                <Card>
                <CardHeader>
                    <CardTitle>Payment Gateway (Stripe)</CardTitle>
                    <CardDescription>
                    Configure Stripe API keys for Test and Live environments. The active mode's keys will be used for all transactions.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue={activePaymentTab} onValueChange={(value) => setActivePaymentTab(value as 'test' | 'live')} className="w-full">
                    <input type="hidden" name="activeMode" value={activePaymentTab} />
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="test">Test Mode</TabsTrigger>
                        <TabsTrigger value="live">Live Mode</TabsTrigger>
                    </TabsList>
                    <TabsContent value="test" className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="test_publishableKey">Publishable Key</Label>
                            <Input id="test_publishableKey" name="test.publishableKey" type="password" defaultValue={initialPaymentGatewaySettings.test.publishableKey} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="test_secretKey">Secret Key</Label>
                            <Input id="test_secretKey" name="test.secretKey" type="password" defaultValue={initialPaymentGatewaySettings.test.secretKey} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="test_webhookSecret">Webhook Signing Secret (Optional)</Label>
                            <Input id="test_webhookSecret" name="test.webhookSecret" type="password" defaultValue={initialPaymentGatewaySettings.test.webhookSecret} />
                            {origin && (
                                <div className="mt-2 flex items-center justify-between rounded-md bg-muted p-2">
                                    <code className="break-all text-sm text-muted-foreground">{webhookUrl}</code>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => handleCopy(webhookUrl)}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="live" className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="live_publishableKey">Publishable Key</Label>
                            <Input id="live_publishableKey" name="live.publishableKey" type="password" defaultValue={initialPaymentGatewaySettings.live.publishableKey} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="live_secretKey">Secret Key</Label>
                            <Input id="live_secretKey" name="live.secretKey" type="password" defaultValue={initialPaymentGatewaySettings.live.secretKey} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="live_webhookSecret">Webhook Signing Secret (Optional)</Label>
                            <Input id="live_webhookSecret" name="live.webhookSecret" type="password" defaultValue={initialPaymentGatewaySettings.live.webhookSecret} />
                            {origin && (
                                <div className="mt-2 flex items-center justify-between rounded-md bg-muted p-2">
                                    <code className="break-all text-sm text-muted-foreground">{webhookUrl}</code>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => handleCopy(webhookUrl)}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                    </Tabs>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                    <SubmitButton pending={isPending}>Save Payment Settings</SubmitButton>
                </CardFooter>
                </Card>
            </form>
        </TabsContent>
        <TabsContent value="analytics" className="mt-6">
             <form action={handleAnalyticsSubmit}>
                <Card>
                <CardHeader>
                    <CardTitle>Global Analytics Settings</CardTitle>
                    <CardDescription>
                    Configure the global Google Analytics 4 ID for platform-wide tracking and SaaS funnel analytics.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                    <Label htmlFor="ga4TrackingId">Platform Google Analytics ID</Label>
                    <Input
                        id="ga4TrackingId"
                        name="ga4TrackingId"
                        placeholder="G-XXXXXXXXXX"
                        defaultValue={initialAnalyticsSettings.ga4TrackingId}
                    />
                    <p className="text-sm text-muted-foreground">
                        This ID is for SaaS funnel tracking and aggregated usage analysis.
                    </p>
                    </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                    <SubmitButton pending={isPending}>Save Analytics Settings</SubmitButton>
                </CardFooter>
                </Card>
            </form>
        </TabsContent>
         <TabsContent value="languages" className="mt-6">
            <LanguageSettingsForm initialSettings={initialLanguageSettings} />
        </TabsContent>
        <TabsContent value="cookies" className="mt-6">
            <Card>
                <CardHeader>
                    <CardTitle>Cookie Consent Texts</CardTitle>
                    <CardDescription>Manage the text content displayed in the cookie consent banner and modal across different languages and versions.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild>
                        <Link href="/superadmin/settings/cookie-texts">
                            <Cookie className="mr-2 h-4 w-4" />
                            Manage Cookie Texts
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        </TabsContent>
    </Tabs>
  );
}
