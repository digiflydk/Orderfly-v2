"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createFeedbackQuestion } from "@/app/superadmin/feedback/actions";

// shadcn/ui
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

// —————————————————————————————————————————
// Types og schema
// —————————————————————————————————————————
const QUESTION_TYPES = [
  { value: "rating-1-5", label: "Rating (1–5)" },
  { value: "yes-no", label: "Ja/Nej" },
  { value: "single-choice", label: "Single choice" },
  { value: "multi-choice", label: "Multi choice" },
  { value: "short-text", label: "Kort tekst" },
  { value: "long-text", label: "Lang tekst" },
] as const;

const Schema = z.object({
  title: z.string().min(2, "Titel er påkrævet"),
  helpText: z.string().optional(),
  type: z.enum(QUESTION_TYPES.map(t => t.value) as [string, ...string[]]),
  required: z.boolean().default(false),
  category: z.string().optional(), // valgfrit felt hvis I kategoriserer spørgsmål
  language: z.string().min(2, "Vælg et sprog"),
  isActive: z.boolean().default(true),

  // Svarmuligheder (bruges kun for choice-typer)
  options: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1, "Option label er påkrævet"),
        value: z.string().min(1, "Option value er påkrævet"),
      })
    )
    .default([]),
});

type FormValues = z.infer<typeof Schema>;

// —————————————————————————————————————————
// Hjælp: sprog-liste (robust, ikke tom)
// —————————————————————————————————————————
const SUPPORTED_LANGUAGES = [
  { code: "da", name: "Danish", isDefault: true },
  { code: "en", name: "English" },
] as const;

function defaultLanguage(): string {
  const def = SUPPORTED_LANGUAGES.find(l => (l as any).isDefault) ?? SUPPORTED_LANGUAGES[0];
  return def.code;
}

// —————————————————————————————————————————
// Komponent
// —————————————————————————————————————————
export default function FeedbackQuestionNewForm() {
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      title: "",
      helpText: "",
      type: "rating-1-5",
      required: false,
      category: "",
      language: defaultLanguage(),
      isActive: true,
      options: [],
    },
  });

  const type = form.watch("type");

  const { fields, append, remove, swap } = useFieldArray({
    control: form.control,
    name: "options",
  });

  const isChoice = type === "single-choice" || type === "multi-choice";

  const onAddOption = () => {
    const n = fields.length + 1;
    append({ id: `opt_${n}`, label: `Option ${n}`, value: `opt_${n}` });
  };

  const onMoveUp = (idx: number) => idx > 0 && swap(idx, idx - 1);
  const onMoveDown = (idx: number) => idx < fields.length - 1 && swap(idx, idx + 1);

  const submit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      // Hvis ikke choice-type, ignorér options server-side.
      const payload: FormValues = {
        ...values,
        options: isChoice ? values.options : [],
      };
      await createFeedbackQuestion(payload);
      // redirect/clear: simpelt clear for nu
      form.reset({
        title: "",
        helpText: "",
        type: "rating-1-5",
        required: false,
        category: "",
        language: defaultLanguage(),
        isActive: true,
        options: [],
      });
      // Evt. vis toast hvis I har en toast-hook
      // toast.success("Question created");
    } finally {
      setSaving(false);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-6">
        {/* Titel */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Titel</FormLabel>
              <FormControl>
                <Input placeholder="F.eks. Hvor tilfreds var du samlet set?" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Hjælpetekst */}
        <FormField
          control={form.control}
          name="helpText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hjælpetekst (valgfri)</FormLabel>
              <FormControl>
                <Textarea placeholder="Uddybning/vejledning vist under spørgsmålet" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Type */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Vælg type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {QUESTION_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Bestemmer hvilken komponent der vises i frontend (rating, ja/nej, valg, tekst).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Required + Active */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="required"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel>Required</FormLabel>
                  <FormDescription>Svaret skal udfyldes af brugeren</FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel>Active</FormLabel>
                  <FormDescription>Er spørgsmålet live?</FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Kategori (valgfri) */}
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kategori (valgfri)</FormLabel>
              <FormControl>
                <Input placeholder="F.eks. Service, Levering, Smag ..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Sprog */}
        <FormField
          control={form.control}
          name="language"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sprog</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Vælg sprog" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map(l => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Options (kun ved choice-typer) */}
        {isChoice && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Svarmuligheder</h3>
              <Button type="button" variant="secondary" onClick={onAddOption}>
                Tilføj option
              </Button>
            </div>

            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground">Ingen muligheder endnu – tilføj mindst én.</p>
            )}

            <div className="space-y-3">
              {fields.map((f, idx) => (
                <div key={f.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5">
                    <FormField
                      control={form.control}
                      name={`options.${idx}.label`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Label</FormLabel>
                          <FormControl>
                            <Input placeholder={`Option ${idx + 1} label`} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="md:col-span-5">
                    <FormField
                      control={form.control}
                      name={`options.${idx}.value`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Value</FormLabel>
                          <FormControl>
                            <Input placeholder={`opt_${idx + 1}`} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="md:col-span-2 flex gap-2">
                    <Button type="button" variant="outline" onClick={() => onMoveUp(idx)}>
                      ↑
                    </Button>
                    <Button type="button" variant="outline" onClick={() => onMoveDown(idx)}>
                      ↓
                    </Button>
                    <Button type="button" variant="destructive" onClick={() => remove(idx)}>
                      Slet
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Opretter..." : "Opret spørgsmål"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
