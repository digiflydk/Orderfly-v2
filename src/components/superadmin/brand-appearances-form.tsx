

'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useActionState, useEffect, useTransition } from 'react';
import type { Brand, BrandAppearances } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { updateBrandAppearances } from '@/app/superadmin/brands/actions';
import { BrandAppearancePreview } from './brand-appearance-preview';

const appearancesSchema = z.object({
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    background: z.string(),
    text: z.string(),
    border: z.string(),
    buttonText: z.string(),
  }),
  typography: z.object({
    fontFamily: z.string(),
  }),
});

type AppearancesFormValues = z.infer<typeof appearancesSchema>;

interface BrandAppearancesFormProps {
    brand: Brand;
}

const FONT_WHITELIST = ['Inter', 'Roboto', 'Lato', 'Open Sans', 'Nunito', 'PT Sans'];

const defaultAppearances: BrandAppearances = {
  colors: {
    primary: '#F26419', 
    secondary: '#FAE7D8', 
    background: '#FFFFFF', 
    text: '#111111',
    border: '#DDDDDD',
    buttonText: '#FFFFFF',
  },
  typography: {
    fontFamily: 'PT Sans',
  },
};

function ColorInput({ name, label, control }: { name: `colors.${string}`, label: string, control: any }) {
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <div className="flex items-center gap-2">
                        <FormControl>
                            <Input type="color" className="h-10 w-12 p-1" {...field} />
                        </FormControl>
                         <FormControl>
                            <Input className="font-mono" {...field} />
                        </FormControl>
                    </div>
                    <FormMessage />
                </FormItem>
            )}
        />
    )
}

function SubmitButton() {
    const [isPending, startTransition] = useTransition();
    
    // This is a workaround to use the pending state from the form action
    const form = useForm();
    const { formState } = form;

    return (
        <Button type="submit" disabled={isPending || formState.isSubmitting} className="w-full">
            {(isPending || formState.isSubmitting) ? <Loader2 className="animate-spin" /> : 'Save Appearances'}
        </Button>
    )
}

export function BrandAppearancesForm({ brand }: BrandAppearancesFormProps) {
  const { toast } = useToast();
  
  const [state, formAction] = useActionState(updateBrandAppearances, null);

  const form = useForm<AppearancesFormValues>({
    resolver: zodResolver(appearancesSchema),
    defaultValues: brand.appearances || defaultAppearances,
  });
  
  const watchedValues = useWatch({ control: form.control });
  
  useEffect(() => {
    if (state?.message) {
        if (state.error) {
            toast({ variant: 'destructive', title: 'Error', description: state.message });
        } else {
            toast({ title: 'Success!', description: "Appearance settings saved." });
        }
    }
  }, [state, toast]);
  
  const onSubmit = (data: AppearancesFormValues) => {
    const formData = new FormData();
    formData.append('brandId', brand.id);
    formData.append('appearances', JSON.stringify(data));
    formAction(formData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <div className="md:col-span-2 space-y-6">
                   <Card>
                      <CardHeader><CardTitle>Color Palette</CardTitle><CardDescription>Define the primary colors for the brand's webshop.</CardDescription></CardHeader>
                      <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <ColorInput name="colors.primary" label="Primary" control={form.control} />
                          <ColorInput name="colors.secondary" label="Secondary" control={form.control} />
                          <ColorInput name="colors.background" label="Background" control={form.control} />
                          <ColorInput name="colors.text" label="Text" control={form.control} />
                          <ColorInput name="colors.border" label="Border" control={form.control} />
                          <ColorInput name="colors.buttonText" label="Button Text" control={form.control} />
                      </CardContent>
                  </Card>
                   <Card>
                      <CardHeader><CardTitle>Typography</CardTitle></CardHeader>
                      <CardContent className="space-y-6">
                          <FormField control={form.control} name="typography.fontFamily" render={({ field }) => (
                              <FormItem className="max-w-xs">
                                  <FormLabel>Font Family</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                      <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                      <SelectContent>{FONT_WHITELIST.map(font => <SelectItem key={font} value={font}>{font}</SelectItem>)}</SelectContent>
                                  </Select>
                              </FormItem>
                          )}/>
                      </CardContent>
                  </Card>
              </div>
              
              <div className="space-y-6">
                   <Card>
                      <CardHeader><CardTitle>Live Preview</CardTitle><CardDescription>Changes here are reflected instantly.</CardDescription></CardHeader>
                      <CardContent>
                          <BrandAppearancePreview values={watchedValues as BrandAppearances} />
                      </CardContent>
                  </Card>
                   <SubmitButton />
              </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
