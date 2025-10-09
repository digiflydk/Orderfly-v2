
'use client';

import { useState, useEffect, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import type { GeneralSettings, NavLink } from '@/types/settings';
import { getSettingsAction, saveSettingsAction } from '@/app/superadmin/website/actions';
import { Loader2, Trash2 } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import CmsLayout from '../../_cmsLayout';
import { useFieldArray, useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel, FormDescription } from '@/components/ui/form';


const footerLinkSchema = z.object({
  label: z.string().min(1, 'Label er påkrævet'),
  href: z.string().min(1, 'URL er påkrævet'),
});

const footerColumnSchema = z.object({
  title: z.string().optional(),
  links: z.array(footerLinkSchema),
});

const socialLinkSchema = z.object({
    kind: z.enum(['facebook','instagram','tiktok','x','youtube','linkedin']),
    href: z.string().url('Ugyldig URL'),
});

const footerFormSchema = z.object({
    isVisible: z.boolean().optional(),
    logoUrl: z.string().url('Ugyldig URL').optional().or(z.literal('')),
    bgColor: z.string().optional(),
    textColor: z.string().optional(),
    linkColor: z.string().optional(),
    linkHoverColor: z.string().optional(),
    columns: z.array(footerColumnSchema).optional(),
    socials: z.array(socialLinkSchema).optional(),
    legalText: z.string().optional(),
});


type FooterFormValues = z.infer<typeof footerFormSchema>;


function FooterSettingsPageContent() {
  const [isSaving, startSaving] = useTransition();
  const { toast } = useToast();
  const [settings, setSettings] = useState<Partial<GeneralSettings>>({});
  const [isLoading, setIsLoading] = useState(true);

  const form = useForm<FooterFormValues>({
    resolver: zodResolver(footerFormSchema),
    defaultValues: {},
  });

  const { fields: columnFields, append: appendColumn, remove: removeColumn } = useFieldArray({
      control: form.control,
      name: "columns"
  });

  useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);
      const loadedSettings = await getSettingsAction();
      if (loadedSettings?.footer) {
        form.reset(loadedSettings.footer);
      }
      setIsLoading(false);
    }
    loadSettings();
  }, [form]);
  
  const handleSaveChanges = form.handleSubmit((data) => {
    startSaving(async () => {
      const result = await saveSettingsAction({ footer: data });
      toast({
        title: result.success ? "Gemt!" : "Fejl!",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    });
  });

  if (isLoading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin"/></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Footer Indstillinger</h1>
          <p className="text-muted-foreground">Tilpas udseendet og indholdet af din sides footer.</p>
        </div>
        <Button size="lg" onClick={handleSaveChanges} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Gem Ændringer
        </Button>
      </div>

    <Form {...form}>
      <form className="space-y-6">
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Generelt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                 <FormField
                    control={form.control}
                    name="isVisible"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                            <FormLabel className="text-base">Vis Footer</FormLabel>
                            <FormDescription>
                            Styr om footeren skal vises på siden.
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
                    name="logoUrl"
                    render={({ field }) => (
                         <FormItem>
                            <FormLabel>Footer Logo URL</FormLabel>
                            <FormControl><Input placeholder="Indsæt URL (valgfrit)" {...field} /></FormControl>
                            <FormMessage />
                         </FormItem>
                    )}
                 />
                 <FormField
                    control={form.control}
                    name="legalText"
                    render={({ field }) => (
                         <FormItem>
                            <FormLabel>Juridisk Tekst</FormLabel>
                            <FormControl><Input placeholder="F.eks. © 2024 OrderFly. Alle rettigheder forbeholdt." {...field} /></FormControl>
                            <FormMessage />
                         </FormItem>
                    )}
                 />
            </CardContent>
        </Card>
        
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Design</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
                 <FormField control={form.control} name="bgColor" render={({ field }) => (<FormItem><FormLabel>Baggrundsfarve</FormLabel><Input type="color" {...field} className="w-full h-10 p-1" /></FormItem>)} />
                 <FormField control={form.control} name="textColor" render={({ field }) => (<FormItem><FormLabel>Tekstfarve</FormLabel><Input type="color" {...field} className="w-full h-10 p-1" /></FormItem>)} />
                 <FormField control={form.control} name="linkColor" render={({ field }) => (<FormItem><FormLabel>Linkfarve</FormLabel><Input type="color" {...field} className="w-full h-10 p-1" /></FormItem>)} />
                 <FormField control={form.control} name="linkHoverColor" render={({ field }) => (<FormItem><FormLabel>Link Hover Farve</FormLabel><Input type="color" {...field} className="w-full h-10 p-1" /></FormItem>)} />
            </CardContent>
        </Card>
        
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Kolonner & Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                 <Accordion type="multiple" className="w-full space-y-4">
                    {columnFields.map((column, colIndex) => (
                        <Card key={column.id} className="p-4">
                            <AccordionItem value={`col-${colIndex}`} className="border-b-0">
                                <div className="flex justify-between items-center">
                                    <AccordionTrigger className="flex-1 text-left font-semibold">
                                        <FormField control={form.control} name={`columns.${colIndex}.title`} render={({field}) => (<Input className="text-base font-semibold" placeholder={`Kolonne ${colIndex + 1}`} {...field} />)} />
                                    </AccordionTrigger>
                                    <Button variant="ghost" size="icon" onClick={() => removeColumn(colIndex)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </div>
                                <AccordionContent className="pt-4 space-y-2">
                                     <InnerLinkArray colIndex={colIndex} control={form.control} />
                                </AccordionContent>
                            </AccordionItem>
                        </Card>
                    ))}
                 </Accordion>
                <Button variant="outline" type="button" onClick={() => appendColumn({ title: 'Ny Kolonne', links: [{label: 'Nyt Link', href: '#'}] })}>Tilføj Kolonne</Button>
            </CardContent>
        </Card>
      </form>
    </Form>
    </div>
  );
}

function InnerLinkArray({ colIndex, control }: { colIndex: number; control: any }) {
    const { fields, append, remove } = useFieldArray({
        control,
        name: `columns.${colIndex}.links`
    });

    return (
        <div className="space-y-4 pl-4 border-l">
            {fields.map((link, linkIndex) => (
                <div key={link.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end relative">
                    <FormField control={control} name={`columns.${colIndex}.links.${linkIndex}.label`} render={({field}) => (<FormItem><FormLabel className="text-xs">Tekst</FormLabel><FormControl><Input placeholder="Link Tekst" {...field} /></FormControl></FormItem>)} />
                    <FormField control={control} name={`columns.${colIndex}.links.${linkIndex}.href`} render={({field}) => (<FormItem><FormLabel className="text-xs">URL</FormLabel><FormControl><Input placeholder="https://..." {...field} /></FormControl></FormItem>)} />
                    <Button variant="ghost" size="icon" className="absolute -right-10 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => remove(linkIndex)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
            ))}
            <Button variant="outline" size="sm" type="button" onClick={() => append({ label: 'Nyt link', href: '#' })}>Tilføj Link</Button>
        </div>
    )
}

export default function CmsFooterPage() {
    return (
        <CmsLayout>
            <FooterSettingsPageContent />
        </CmsLayout>
    )
}
