

'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { useEffect, useTransition } from 'react';
import Link from 'next/link';

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { FeedbackQuestionsVersion, LanguageSetting, FeedbackQuestionOption, FeedbackQuestion } from '@/types';
import { createOrUpdateQuestionVersion } from '@/app/superadmin/feedback/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const questionOptionSchema = z.object({
    id: z.string(),
    label: z.string().min(1, "Option label cannot be empty."),
});

const questionSchema = z.object({
  questionId: z.string().min(1),
  label: z.string().min(3, "Label must be at least 3 characters."),
  type: z.enum(['stars', 'nps', 'text', 'tags', 'multiple_options']),
  isRequired: z.boolean(),
  options: z.array(questionOptionSchema).optional(),
  minSelection: z.coerce.number().optional(),
  maxSelection: z.coerce.number().optional(),
});

const feedbackQuestionVersionSchema = z.object({
  id: z.string().optional(),
  versionLabel: z.string().min(1, "Version label is required."),
  isActive: z.boolean().default(false),
  language: z.string().min(2, "Language code is required."),
  orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type must be selected.'),
  questions: z.array(questionSchema).min(1, "At least one question is required."),
});

type VersionFormValues = z.infer<typeof feedbackQuestionVersionSchema>;

interface FeedbackQuestionVersionFormProps {
  version?: FeedbackQuestionsVersion;
  supportedLanguages: LanguageSetting[];
}

export function FeedbackQuestionVersionForm({ version, supportedLanguages }: FeedbackQuestionVersionFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<VersionFormValues>({
    resolver: zodResolver(feedbackQuestionVersionSchema),
    defaultValues: version || {
      versionLabel: '',
      isActive: false,
      language: 'da',
      orderTypes: ['pickup', 'delivery'],
      questions: [],
    },
  });

  const { control, handleSubmit, watch } = form;
  
  const { fields, append, remove } = useFieldArray({
    control,
    name: "questions"
  });

  useEffect(() => {
    if (version) {
      form.reset(version);
    }
  }, [version, form]);

  const onSubmit = (data: VersionFormValues) => {
    const formData = new FormData();
    if (version?.id) formData.append('id', version.id);
    formData.append('versionLabel', data.versionLabel);
    if (data.isActive) formData.append('isActive', 'on');
    formData.append('language', data.language);
    data.orderTypes.forEach(type => formData.append('orderTypes', type));
    formData.append('questions', JSON.stringify(data.questions));

    startTransition(async () => {
        await createOrUpdateQuestionVersion(formData);
        // The redirect will happen in the server action, so a toast is not necessary here.
    });
  };

  const title = version ? 'Edit Question Version' : 'New Question Version';
  const description = version ? `Editing details for ${version.versionLabel}.` : 'Fill in the details for the new version.';

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-muted-foreground">{description}</p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" asChild>
                    <Link href="/superadmin/feedback/questions">Cancel</Link>
                </Button>
                <Button type="submit" disabled={isPending}>
                    {isPending ? <Loader2 className="animate-spin" /> : (version ? 'Save Changes' : 'Create Version')}
                </Button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 h-fit">
                <CardHeader>
                    <CardTitle>Version Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <FormField control={control} name="versionLabel" render={({ field }) => (
                        <FormItem><FormLabel>Version Label</FormLabel><FormControl><Input placeholder="e.g., v1.0, 2025 Q3" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={control} name="language" render={({ field }) => (
                         <FormItem><FormLabel>Language</FormLabel>
                             <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger></FormControl>
                             <SelectContent>{supportedLanguages.map(lang => (<SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
                    )}/>
                     <FormField control={form.control} name="isActive" render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>Active</FormLabel><FormDescription>Is this version live?</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                    )}/>
                     <FormField
                        control={control}
                        name="orderTypes"
                        render={() => (
                            <FormItem>
                                <FormLabel>Order Types</FormLabel>
                                <FormDescription>Apply this version to selected order types.</FormDescription>
                                <div className="flex flex-col space-y-2 pt-2">
                                  <FormField
                                    control={control}
                                    name="orderTypes"
                                    render={({ field }) => (
                                      <FormItem className="flex items-center space-x-3">
                                        <FormControl><Checkbox checked={field.value?.includes('pickup')} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), 'pickup']) : field.onChange((field.value || []).filter(v => v !== 'pickup'))} /></FormControl>
                                        <FormLabel className="font-normal">Pickup</FormLabel>
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={control}
                                    name="orderTypes"
                                    render={({ field }) => (
                                      <FormItem className="flex items-center space-x-3">
                                        <FormControl><Checkbox checked={field.value?.includes('delivery')} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), 'delivery']) : field.onChange((field.value || []).filter(v => v !== 'delivery'))} /></FormControl>
                                        <FormLabel className="font-normal">Delivery</FormLabel>
                                      </FormItem>
                                    )}
                                  />
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </CardContent>
            </Card>

            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Questions</CardTitle>
                    <CardDescription>Add and configure the questions for this version.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {fields.map((field, index) => {
                      const questionType = watch(`questions.${index}.type`);
                      return (
                        <Card key={field.id} className="p-4 relative">
                            <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6 text-destructive" onClick={() => remove(index)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 <FormField control={control} name={`questions.${index}.label`} render={({ field }) => (
                                    <FormItem><FormLabel>Label</FormLabel><FormControl><Input placeholder="How was your food?" {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                 <FormField control={control} name={`questions.${index}.type`} render={({ field }) => (
                                    <FormItem><FormLabel>Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent>
                                        <SelectItem value="stars">Stars (1-5)</SelectItem>
                                        <SelectItem value="nps">NPS (0-10)</SelectItem>
                                        <SelectItem value="text">Text Input</SelectItem>
                                        <SelectItem value="tags">Tags</SelectItem>
                                        <SelectItem value="multiple_options">Multiple Options</SelectItem>
                                    </SelectContent></Select><FormMessage /></FormItem>
                                )}/>
                            </div>
                             {questionType === 'multiple_options' && (
                                <div className="mt-4 space-y-4">
                                     <FormField
                                        control={control}
                                        name={`questions.${index}.options`}
                                        render={({ field: optionsField }) => (
                                        <FormItem>
                                            <FormLabel>Options</FormLabel>
                                            <div className="space-y-2">
                                            {(optionsField.value || []).map((option, optionIndex) => (
                                                <div key={option.id} className="flex items-center gap-2">
                                                <Input
                                                    placeholder={`Option ${optionIndex + 1}`}
                                                    defaultValue={option.label}
                                                    onChange={(e) => {
                                                        const newOptions = [...(optionsField.value || [])];
                                                        newOptions[optionIndex] = { ...newOptions[optionIndex], label: e.target.value };
                                                        optionsField.onChange(newOptions);
                                                    }}
                                                />
                                                <Button type="button" variant="ghost" size="icon" onClick={() => {
                                                    const newOptions = [...(optionsField.value || [])];
                                                    newOptions.splice(optionIndex, 1);
                                                    optionsField.onChange(newOptions);
                                                }}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                                </div>
                                            ))}
                                            </div>
                                            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => {
                                                const newOptions = [...(optionsField.value || []), { id: `opt_${Date.now()}`, label: '' }];
                                                optionsField.onChange(newOptions);
                                            }}>
                                            <PlusCircle className="mr-2 h-4 w-4" /> Add Option
                                            </Button>
                                        </FormItem>
                                        )}
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={control} name={`questions.${index}.minSelection`} render={({ field }) => (<FormItem><FormLabel>Min Selection</FormLabel><FormControl><Input type="number" placeholder="1" {...field} /></FormControl><FormMessage/></FormItem>)}/>
                                        <FormField control={control} name={`questions.${index}.maxSelection`} render={({ field }) => (<FormItem><FormLabel>Max Selection</FormLabel><FormControl><Input type="number" placeholder="1" {...field} /></FormControl><FormMessage/></FormItem>)}/>
                                    </div>
                                </div>
                             )}

                            <FormField control={control} name={`questions.${index}.isRequired`} render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 mt-4">
                                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange}/></FormControl>
                                    <FormLabel className="font-normal text-sm">Required</FormLabel>
                                </FormItem>
                            )}/>
                            <FormField control={control} name={`questions.${index}.questionId`} render={({ field }) => (<Input type="hidden" {...field} />)} />
                        </Card>
                      )
                    })}
                    <Button type="button" variant="outline" size="sm" onClick={() => append({ questionId: `q_${Date.now()}`, label: '', type: 'stars', isRequired: false })}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Question
                    </Button>
                     <FormField control={control} name="questions" render={() => (<FormMessage />)} />
                </CardContent>
            </Card>
        </div>
      </form>
    </Form>
  );
}
