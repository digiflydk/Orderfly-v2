'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { saveBrandWebsiteDesignSystem, type DesignSystemInput } from '@/lib/superadmin/brand-website/config-actions';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

const designSystemSchema = z.object({
  typography: z.object({
    headingFont: z.string().min(1),
    bodyFont: z.string().min(1),
    h1Size: z.string().min(1),
    h2Size: z.string().min(1),
    h3Size: z.string().min(1),
    bodySize: z.string().min(1),
  }).optional(),
  colors: z.object({
    primary: z.string().min(1),
    secondary: z.string().min(1),
    background: z.string().min(1),
    textPrimary: z.string().min(1),
    textSecondary: z.string().min(1),
    headerBackground: z.string().min(1),
    footerBackground: z.string().min(1),
  }).optional(),
  buttons: z.object({
    shape: z.enum(['pill', 'rounded', 'square']),
    defaultVariant: z.string().optional(),
  }).optional(),
  header: z.object({
    sticky: z.boolean(),
    height: z.string(),
    transparencyPercent: z.number().min(0).max(100),
  }).optional(),
  spacing: z.object({
      xs: z.number(),
      sm: z.number(),
      md: z.number(),
      lg: z.number(),
      xl: z.number(),
    }).optional(),
});

type DesignSystemFormValues = z.infer<typeof designSystemSchema>;

interface BrandWebsiteDesignSystemFormProps {
  brandId: string;
  initialDesignConfig: Partial<DesignSystemInput>;
}

const FONT_WHITELIST = ['Inter', 'Roboto', 'Lato', 'Open Sans', 'Nunito', 'PT Sans'];

export function BrandWebsiteDesignSystemForm({ brandId, initialDesignConfig }: BrandWebsiteDesignSystemFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<DesignSystemFormValues>({
    resolver: zodResolver(designSystemSchema),
    defaultValues: {
      typography: initialDesignConfig.typography || { headingFont: 'Inter', bodyFont: 'Inter', h1Size: '3rem', h2Size: '2.25rem', h3Size: '1.875rem', bodySize: '1rem' },
      colors: initialDesignConfig.colors || { primary: '#000000', secondary: '#F0F0F0', background: '#FFFFFF', textPrimary: '#111111', textSecondary: '#666666', headerBackground: '#FFFFFF', footerBackground: '#111111' },
      buttons: initialDesignConfig.buttons || { shape: 'rounded', defaultVariant: 'solid' },
      header: initialDesignConfig.header || { sticky: true, height: '80px', transparencyPercent: 0 },
      spacing: initialDesignConfig.spacing || { xs: 4, sm: 8, md: 16, lg: 32, xl: 64 },
    },
  });

  const onSubmit = (data: DesignSystemFormValues) => {
    startTransition(async () => {
      try {
        await saveBrandWebsiteDesignSystem(brandId, data);
        toast({ title: 'Success', description: 'Design system settings saved successfully.' });
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
            <CardTitle>Design System</CardTitle>
            <CardDescription>Customize the look and feel of the brand's website.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <Card>
                <CardHeader><CardTitle className="text-lg">Colors</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FormField control={form.control} name="colors.primary" render={({ field }) => (<FormItem><FormLabel>Primary</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>)}/>
                    <FormField control={form.control} name="colors.secondary" render={({ field }) => (<FormItem><FormLabel>Secondary</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>)}/>
                    <FormField control={form.control} name="colors.background" render={({ field }) => (<FormItem><FormLabel>Background</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>)}/>
                    <FormField control={form.control} name="colors.textPrimary" render={({ field }) => (<FormItem><FormLabel>Text Primary</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>)}/>
                    <FormField control={form.control} name="colors.textSecondary" render={({ field }) => (<FormItem><FormLabel>Text Secondary</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>)}/>
                    <FormField control={form.control} name="colors.headerBackground" render={({ field }) => (<FormItem><FormLabel>Header Background</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>)}/>
                    <FormField control={form.control} name="colors.footerBackground" render={({ field }) => (<FormItem><FormLabel>Footer Background</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>)}/>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-lg">Typography</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="typography.headingFont" render={({ field }) => (
                            <FormItem><FormLabel>Heading Font</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{FONT_WHITELIST.map(font=><SelectItem key={font} value={font}>{font}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>
                        )}/>
                        <FormField control={form.control} name="typography.bodyFont" render={({ field }) => (
                            <FormItem><FormLabel>Body Font</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{FONT_WHITELIST.map(font=><SelectItem key={font} value={font}>{font}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>
                        )}/>
                    </div>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <FormField control={form.control} name="typography.h1Size" render={({ field }) => (<FormItem><FormLabel>H1 Size</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="typography.h2Size" render={({ field }) => (<FormItem><FormLabel>H2 Size</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="typography.h3Size" render={({ field }) => (<FormItem><FormLabel>H3 Size</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="typography.bodySize" render={({ field }) => (<FormItem><FormLabel>Body Size</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                 <CardHeader><CardTitle className="text-lg">Header</CardTitle></CardHeader>
                 <CardContent className="space-y-4">
                    <FormField control={form.control} name="header.sticky" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><FormLabel>Sticky Header</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange}/></FormControl></FormItem>)}/>
                    <FormField control={form.control} name="header.height" render={({ field }) => (<FormItem><FormLabel>Header Height (px)</FormLabel><FormControl><Input type="text" {...field} /></FormControl></FormItem>)}/>
                    <FormField
                        control={form.control}
                        name="header.transparencyPercent"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Header Transparency ({field.value}%)</FormLabel>
                                <FormControl>
                                    <Slider
                                        value={[field.value ?? 0]}
                                        onValueChange={(value) => field.onChange(value[0])}
                                        max={100}
                                        step={1}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                        />
                 </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle className="text-lg">Buttons</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="buttons.shape" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Button Shape</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="rounded">Rounded</SelectItem>
                                    <SelectItem value="pill">Pill</SelectItem>
                                    <SelectItem value="square">Square</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )}/>
                     <FormField control={form.control} name="buttons.defaultVariant" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Default Variant</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="solid">Solid</SelectItem>
                                    <SelectItem value="outline">Outline</SelectItem>
                                    <SelectItem value="ghost">Ghost</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )}/>
                </CardContent>
            </Card>
             <Card>
                <CardHeader><CardTitle className="text-lg">Spacing (px)</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <FormField control={form.control} name="spacing.xs" render={({ field }) => (<FormItem><FormLabel>Extra Small</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)}/>
                    <FormField control={form.control} name="spacing.sm" render={({ field }) => (<FormItem><FormLabel>Small</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)}/>
                    <FormField control={form.control} name="spacing.md" render={({ field }) => (<FormItem><FormLabel>Medium</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)}/>
                    <FormField control={form.control} name="spacing.lg" render={({ field }) => (<FormItem><FormLabel>Large</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)}/>
                    <FormField control={form.control} name="spacing.xl" render={({ field }) => (<FormItem><FormLabel>Extra Large</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)}/>
                </CardContent>
            </Card>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Design System
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
