
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
import { brandWebsiteDesignSystemSchema } from '@/lib/superadmin/brand-website/config-schemas';

type DesignSystemFormValues = z.infer<typeof brandWebsiteDesignSystemSchema>;

interface BrandWebsiteDesignSystemFormProps {
  brandId: string;
  initialDesignConfig: Partial<DesignSystemInput>;
}

const FONT_WHITELIST = ['Inter', 'Roboto', 'Lato', 'Open Sans', 'Nunito', 'PT Sans'];

const defaultButtonStyles = {
  borderRadius: "9999px",
  paddingX: "1.25rem",
  paddingY: "0.75rem",
  fontWeight: "600",
  uppercase: false,
  primaryVariant: { background: '#FFBD02', text: '#000000' },
  secondaryVariant: { background: '#333333', text: '#FFFFFF' },
};

export function BrandWebsiteDesignSystemForm({ brandId, initialDesignConfig }: BrandWebsiteDesignSystemFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<DesignSystemFormValues>({
    resolver: zodResolver(brandWebsiteDesignSystemSchema),
    defaultValues: {
      typography: initialDesignConfig.typography || { headingFont: 'Inter', bodyFont: 'Inter', h1Size: '3rem', h2Size: '2.25rem', h3Size: '1.875rem', bodySize: '1rem', buttonSize: '0.875rem' },
      colors: initialDesignConfig.colors || { primary: '#000000', secondary: '#F0F0F0', background: '#FFFFFF', textPrimary: '#111111', textSecondary: '#666666', headerBackground: '#FFFFFF', footerBackground: '#111111' },
      buttons: initialDesignConfig.buttons || defaultButtonStyles,
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
                     <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <FormField control={form.control} name="typography.h1Size" render={({ field }) => (<FormItem><FormLabel>H1 Size</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="typography.h2Size" render={({ field }) => (<FormItem><FormLabel>H2 Size</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="typography.h3Size" render={({ field }) => (<FormItem><FormLabel>H3 Size</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="typography.bodySize" render={({ field }) => (<FormItem><FormLabel>Body Size</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="typography.buttonSize" render={({ field }) => (<FormItem><FormLabel>Button Size</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader><CardTitle className="text-lg">Buttons</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <FormField control={form.control} name="buttons.borderRadius" render={({ field }) => (<FormItem><FormLabel>Border Radius</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="buttons.paddingX" render={({ field }) => (<FormItem><FormLabel>Padding X</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="buttons.paddingY" render={({ field }) => (<FormItem><FormLabel>Padding Y</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                         <FormField control={form.control} name="buttons.fontWeight" render={({ field }) => (
                            <FormItem><FormLabel>Font Weight</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>
                                <SelectItem value="400">Normal</SelectItem>
                                <SelectItem value="500">Medium</SelectItem>
                                <SelectItem value="600">Semibold</SelectItem>
                                <SelectItem value="700">Bold</SelectItem>
                            </SelectContent></Select></FormItem>
                        )}/>
                    </div>
                    <FormField control={form.control} name="buttons.uppercase" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><FormLabel>Uppercase Text</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange}/></FormControl></FormItem>)}/>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="buttons.primaryVariant.background" render={({ field }) => (<FormItem><FormLabel>Primary BG</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>)}/>
                        <FormField control={form.control} name="buttons.primaryVariant.text" render={({ field }) => (<FormItem><FormLabel>Primary Text</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>)}/>
                        <FormField control={form.control} name="buttons.secondaryVariant.background" render={({ field }) => (<FormItem><FormLabel>Secondary BG</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>)}/>
                        <FormField control={form.control} name="buttons.secondaryVariant.text" render={({ field }) => (<FormItem><FormLabel>Secondary Text</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>)}/>
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
