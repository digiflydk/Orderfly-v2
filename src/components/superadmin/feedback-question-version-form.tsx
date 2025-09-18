
"use client";

import * as React from "react";
import { useMemo } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// shadcn/ui
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

/**
 * =====================================================================
 *  FEEDBACK QUESTION VERSION FORM (robust language handling)
 *  - No external i18n dependency required
 *  - Always provides a non-empty supportedLanguages array
 *  - Backward-compatible props: { initialData?, onSubmit, submitLabel? }
 * =====================================================================
 */

const FormSchema = z.object({
  // Tilpas gerne hvis der findes flere felter i den omkringliggende kodebase.
  // Her bevarer vi kun de felter vi VED bruges i udklippet: language + isActive.
  language: z.string().min(2, "Vælg et sprog"),
  isActive: z.boolean().default(true),
});

export type FeedbackQuestionVersionFormValues = z.infer<typeof FormSchema>;

type Props = {
  initialData?: Partial<FeedbackQuestionVersionFormValues> & Record<string, any>;
  onSubmit: (values: FeedbackQuestionVersionFormValues) => Promise<void> | void;
  submitLabel?: string;
};

export default function FeedbackQuestionVersionForm(props: Props) {
  const { initialData, onSubmit, submitLabel = "Save" } = props;

  /**
   * Lokal, robust sprogliste.
   * - Må IKKE være tom.
   * - Må IKKE være undefined.
   * - Hvis der senere tilføjes central i18n-kilde, kan den mappes ind HER
   *   men man MÅ IKKE fjerne fallback-listen.
   */
  const supportedLanguages = useMemo(
    () =>
      [
        { code: "da", name: "Danish", isDefault: true },
        { code: "en", name: "English" },
      ] as const,
    []
  );

  const defaultLanguageCode = useMemo(() => {
    const explicit = (initialData?.language as string | undefined)?.trim();
    if (explicit && supportedLanguages.some(l => l.code === explicit)) return explicit;
    const def = supportedLanguages.find(l => (l as any).isDefault) ?? supportedLanguages[0];
    return def.code;
  }, [initialData?.language, supportedLanguages]);

  const form = useForm<FeedbackQuestionVersionFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      language: defaultLanguageCode,
      isActive: typeof initialData?.isActive === "boolean" ? Boolean(initialData?.isActive) : true,
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    // Sikrer at language ALTID er en gyldig kode
    const lang = supportedLanguages.some(l => l.code === values.language)
      ? values.language
      : defaultLanguageCode;

    await onSubmit({
      ...values,
      language: lang,
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* LANGUAGE */}
        <FormField
          control={form.control}
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
                  {supportedLanguages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Vælg sprog for denne versions indhold.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ACTIVE */}
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel>Active</FormLabel>
                <FormDescription>Is this version live?</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit */}
        <div className="flex justify-end gap-2">
          <Button type="submit">{submitLabel}</Button>
        </div>
      </form>
    </Form>
  );
}
