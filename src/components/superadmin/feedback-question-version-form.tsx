'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { useEffect, useTransition, useMemo } from 'react';
import Link from 'next/link';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { FeedbackQuestionsVersion, LanguageSetting } from '@/types';
import { createOrUpdateQuestionVersion } from '@/app/superadmin/feedback/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

/* ---------------------- Schemas ---------------------- */
const ORDER_TYPES = ['pickup', 'delivery'] as const;
const QUESTION_TYPES = ['stars', 'nps', 'text', 'tags', 'multiple_options'] as const;

const questionOptionSchema = z.object({
  id: z.string(),
  label: z.string().min(1, 'Option label cannot be empty.'),
  value: z.string().min(1, 'Option value cannot be empty.'),
});

const questionSchema = z.object({
  questionId: z.string().min(1),
  label: z.string().min(3, 'Label must be at least 3 characters.'),
  type: z.enum(QUESTION_TYPES),
  isRequired: z.boolean().default(false),
  options: z.array(questionOptionSchema).optional().default([]),
  minSelection: z.coerce.number().optional(),
  maxSelection: z.coerce.number().optional(),
});

const feedbackQuestionVersionSchema = z.object({
  id: z.string().optional(),
  versionLabel: z.string().min(1, 'Version label is required.'),
  isActive: z.boolean().default(false),
  language: z.string().min(2, 'Language code is required.'),
  orderTypes: z.array(z.enum(ORDER_TYPES)).min(1, 'At least one order type must be selected.'),
  questions: z.array(questionSchema).min(1, 'At least one question is required.'),
});

type VersionFormValues = z.infer<typeof feedbackQuestionVersionSchema>;

export interface FeedbackQuestionVersionFormProps {
  mode: 'create' | 'edit';
  id?: string;
  initialData?: Record<string, any> | null;
  version?: FeedbackQuestionsVersion;
  supportedLanguages: LanguageSetting[];
  action?: (formData: FormData) => Promise<any>;
}

function toOrderTypeArray(value: unknown): Array<(typeof ORDER_TYPES)[number]> {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is (typeof ORDER_TYPES)[number] => v === 'pickup' || v === 'delivery');
}

function buildDefaultValues(version?: FeedbackQuestionsVersion): VersionFormValues {
  if (version) {
    return {
      id: version.id,
      versionLabel: version.versionLabel ?? '',
      isActive: !!(version as any).isActive,
      language: (version as any).language ?? 'da',
      orderTypes: toOrderTypeArray((version as any).orderTypes) as any,
      questions: Array.isArray((version as any).questions)
        ? (version as any).questions.map((q: any) => ({
            questionId: String(q.questionId ?? `q_${Date.now()}`),
            label: String(q.label ?? ''),
            type: (QUESTION_TYPES.includes(q.type) ? q.type : 'stars') as (typeof QUESTION_TYPES)[number],
            isRequired: !!q.isRequired,
            options: Array.isArray(q.options)
              ? q.options.map((o: any) => ({
                  id: String(o.id ?? `opt_${Date.now()}`),
                  label: String(o.label ?? ''),
                  value: String(o.value ?? String(o.id ?? `opt_${Date.now()}`)),
                }))
              : [],
            minSelection: q.minSelection ?? undefined,
            maxSelection: q.maxSelection ?? undefined,
          }))
        : [],
    };
  }

  return {
    versionLabel: '',
    isActive: false,
    language: 'da',
    orderTypes: ['pickup', 'delivery'],
    questions: [],
  };
}

export default function FeedbackQuestionVersionForm({ version, supportedLanguages }: FeedbackQuestionVersionFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const safeSupportedLanguages = useMemo<LanguageSetting[]>(() => {
    if (Array.isArray(supportedLanguages) && supportedLanguages.length > 0) return supportedLanguages;
    return [
      { code: 'da', name: 'Danish' } as LanguageSetting,
      { code: 'en', name: 'English' } as LanguageSetting,
    ];
  }, [supportedLanguages]);

  const form = useForm<VersionFormValues>({
    // IMPORTANT: Cast keeps strict TS happy with zodResolver generics in this codebase
    resolver: zodResolver(feedbackQuestionVersionSchema) as any,
    defaultValues: buildDefaultValues(version),
    mode: 'onSubmit',
  });

  const { control, handleSubmit, watch } = form;
  const { fields, append, remove } = useFieldArray({
    control: control as any,
    name: 'questions',
  });

  useEffect(() => {
    if (version) form.reset(buildDefaultValues(version));
    else form.reset(buildDefaultValues(undefined));
  }, [version, form]);

  const onSubmit = (data: VersionFormValues) => {
    const formData = new FormData();

    if (data.id) formData.append('id', data.id);
    formData.append('versionLabel', data.versionLabel);

    if (data.isActive) formData.append('isActive', 'on');

    formData.append('language', data.language);

    (data.orderTypes || []).forEach((t) => formData.append('orderTypes', t));

    formData.append('questions', JSON.stringify(data.questions || []));

    startTransition(async () => {
      const result = await createOrUpdateQuestionVersion(formData);

      if (result && (result as any).ok) {
        const id = (result as any).id as string;
        window.location.href = `/superadmin/feedback/questions/edit/${id}`;
        return;
      }

      const errorMsg = (result as any)?.error ?? 'Failed to save question version';
      toast({ title: 'Kunne ikke gemme', description: errorMsg, variant: 'destructive' });
    });
  };

  const title = version ? 'Edit Question Version' : 'New Question Version';
  const description = version ? `Editing details for ${version.versionLabel}.` : 'Fill in the details for the new version.';

  const selectedOrderTypes = watch('orderTypes') || [];

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" asChild disabled={isPending}>
              <Link href="/superadmin/feedback/questions">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : version ? 'Save Changes' : 'Create Version'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Version details */}
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <CardTitle>Version Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={control}
                name="versionLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Version Label</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., v1.0, 2025 Q3" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Language</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {safeSupportedLanguages.map((lang) => (
                          <SelectItem key={lang.code} value={lang.code}>
                            {lang.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>Is this version live?</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="orderTypes"
                render={({ field }) => {
                  const current = Array.isArray(field.value) ? field.value : [];
                  const hasPickup = current.includes('pickup');
                  const hasDelivery = current.includes('delivery');

                  return (
                    <FormItem>
                      <FormLabel>Order Types</FormLabel>
                      <FormDescription>Apply this version to selected order types.</FormDescription>

                      <div className="flex flex-col space-y-2 pt-2">
                        <div className="flex items-center space-x-3">
                          <FormControl>
                            <Checkbox
                              checked={hasPickup}
                              onCheckedChange={(checked) => {
                                const isChecked = checked === true;
                                field.onChange(
                                  isChecked
                                    ? Array.from(new Set([...current, 'pickup']))
                                    : current.filter((t) => t !== 'pickup'),
                                );
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">Pickup</FormLabel>
                        </div>

                        <div className="flex items-center space-x-3">
                          <FormControl>
                            <Checkbox
                              checked={hasDelivery}
                              onCheckedChange={(checked) => {
                                const isChecked = checked === true;
                                field.onChange(
                                  isChecked
                                    ? Array.from(new Set([...current, 'delivery']))
                                    : current.filter((t) => t !== 'delivery'),
                                );
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">Delivery</FormLabel>
                        </div>
                      </div>

                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </CardContent>
          </Card>

          {/* Right: Questions builder */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Questions</CardTitle>
              <CardDescription>Add and configure the questions for this version.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((qField, index) => {
                const questionType = watch(`questions.${index}.type`);

                return (
                  <Card key={qField.id} className="p-4 relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6 text-destructive"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={control}
                        name={`questions.${index}.label`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Label</FormLabel>
                            <FormControl>
                              <Input placeholder="How was your food?" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name={`questions.${index}.type`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="stars">Stars (1-5)</SelectItem>
                                <SelectItem value="nps">NPS (0-10)</SelectItem>
                                <SelectItem value="text">Text Input</SelectItem>
                                <SelectItem value="tags">Tags</SelectItem>
                                <SelectItem value="multiple_options">Multiple Options</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {questionType === 'multiple_options' && (
                      <div className="mt-4 space-y-4">
                        <FormField
                          control={control}
                          name={`questions.${index}.options`}
                          render={({ field }) => {
                            const currentOptions = Array.isArray(field.value) ? field.value : [];

                            return (
                              <FormItem>
                                <FormLabel>Options</FormLabel>

                                <div className="space-y-2">
                                  {currentOptions.map((option: any, optionIndex: number) => (
                                    <div key={option.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                                      <div className="md:col-span-5">
                                        <Input
                                          placeholder={`Option ${optionIndex + 1} label`}
                                          value={option.label ?? ''}
                                          onChange={(e) => {
                                            const next = [...currentOptions];
                                            next[optionIndex] = { ...next[optionIndex], label: e.target.value };
                                            field.onChange(next);
                                          }}
                                        />
                                      </div>

                                      <div className="md:col-span-5">
                                        <Input
                                          placeholder={`opt_${optionIndex + 1}`}
                                          value={option.value ?? ''}
                                          onChange={(e) => {
                                            const next = [...currentOptions];
                                            next[optionIndex] = { ...next[optionIndex], value: e.target.value };
                                            field.onChange(next);
                                          }}
                                        />
                                      </div>

                                      <div className="md:col-span-2 flex justify-end">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => {
                                            const next = [...currentOptions];
                                            next.splice(optionIndex, 1);
                                            field.onChange(next);
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="mt-2"
                                  onClick={() => {
                                    const id = `opt_${Date.now()}`;
                                    const next = [
                                      ...currentOptions,
                                      { id, label: '', value: id },
                                    ];
                                    field.onChange(next);
                                  }}
                                >
                                  <PlusCircle className="mr-2 h-4 w-4" /> Add Option
                                </Button>

                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={control}
                            name={`questions.${index}.minSelection`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Min Selection</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    placeholder="1"
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={control}
                            name={`questions.${index}.maxSelection`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Max Selection</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    placeholder="1"
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    )}

                    <FormField
                      control={control}
                      name={`questions.${index}.isRequired`}
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 mt-4">
                          <FormControl>
                            <Checkbox
                              checked={!!field.value}
                              onCheckedChange={(checked) => field.onChange(checked === true)}
                            />
                          </FormControl>
                          <FormLabel className="font-normal text-sm">Required</FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name={`questions.${index}.questionId`}
                      render={({ field }) => <Input type="hidden" {...field} />}
                    />
                  </Card>
                );
              })}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    questionId: `q_${Date.now()}`,
                    label: '',
                    type: 'stars',
                    isRequired: false,
                    options: [],
                    minSelection: undefined,
                    maxSelection: undefined,
                  } as any)
                }
              >
                <PlusCircle className="mr-2 h-4 w-4" /> Add Question
              </Button>

              <FormField control={control} name="questions" render={() => <FormMessage />} />
            </CardContent>
          </Card>
        </div>
      </form>
    </Form>
  );
}
