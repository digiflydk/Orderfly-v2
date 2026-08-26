'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';

import type { FeedbackQuestionsVersion, LanguageSetting } from '@/types';
import { createOrUpdateQuestionVersion } from '@/app/superadmin/feedback/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

const EXPERIENCE_TYPES = ['pickup', 'delivery', 'booking'] as const;
const QUESTION_TYPES = ['stars', 'nps', 'text', 'tags', 'multiple_options'] as const;

type ExperienceType = (typeof EXPERIENCE_TYPES)[number];
type QuestionType = (typeof QUESTION_TYPES)[number];
type OptionDraft = { id: string; label: string; value: string };
type QuestionDraft = {
  questionId: string;
  label: string;
  type: QuestionType;
  isRequired: boolean;
  options: OptionDraft[];
  minSelection?: number;
  maxSelection?: number;
};
type VersionDraft = {
  id?: string;
  versionLabel: string;
  isActive: boolean;
  language: string;
  orderTypes: ExperienceType[];
  questions: QuestionDraft[];
};

export interface FeedbackQuestionVersionFormProps {
  mode: 'create' | 'edit';
  id?: string;
  initialData?: Record<string, any> | null;
  version?: FeedbackQuestionsVersion;
  supportedLanguages: LanguageSetting[];
  action?: (formData: FormData) => Promise<any>;
}

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function normalizeExperienceTypes(value: unknown): ExperienceType[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ExperienceType =>
    item === 'pickup' || item === 'delivery' || item === 'booking',
  );
}

function normalizeQuestion(value: any): QuestionDraft {
  const type = QUESTION_TYPES.includes(value?.type) ? value.type as QuestionType : 'stars';
  return {
    questionId: String(value?.questionId || newId('q')),
    label: String(value?.label || ''),
    type,
    isRequired: Boolean(value?.isRequired),
    options: Array.isArray(value?.options)
      ? value.options.map((option: any) => ({
          id: String(option?.id || newId('opt')),
          label: String(option?.label || ''),
          value: String(option?.value || option?.id || newId('value')),
        }))
      : [],
    minSelection: value?.minSelection == null ? undefined : Number(value.minSelection),
    maxSelection: value?.maxSelection == null ? undefined : Number(value.maxSelection),
  };
}

function draftFrom(version?: FeedbackQuestionsVersion): VersionDraft {
  if (!version) {
    return {
      versionLabel: '',
      isActive: false,
      language: 'da',
      orderTypes: ['pickup', 'delivery'],
      questions: [],
    };
  }

  return {
    id: version.id,
    versionLabel: String(version.versionLabel || ''),
    isActive: Boolean((version as any).isActive),
    language: String((version as any).language || 'da'),
    orderTypes: normalizeExperienceTypes((version as any).orderTypes),
    questions: Array.isArray((version as any).questions)
      ? (version as any).questions.map(normalizeQuestion)
      : [],
  };
}

export default function FeedbackQuestionVersionForm({
  version,
  supportedLanguages,
}: FeedbackQuestionVersionFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [draft, setDraft] = useState<VersionDraft>(() => draftFrom(version));

  useEffect(() => setDraft(draftFrom(version)), [version]);

  const languages = useMemo<LanguageSetting[]>(() => {
    if (Array.isArray(supportedLanguages) && supportedLanguages.length > 0) return supportedLanguages;
    return [
      { code: 'da', name: 'Danish' } as LanguageSetting,
      { code: 'en', name: 'English' } as LanguageSetting,
    ];
  }, [supportedLanguages]);

  const toggleExperience = (experience: ExperienceType, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      orderTypes: checked
        ? Array.from(new Set([...current.orderTypes, experience]))
        : current.orderTypes.filter((item) => item !== experience),
    }));
  };

  const updateQuestion = (index: number, patch: Partial<QuestionDraft>) => {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, i) => i === index ? { ...question, ...patch } : question),
    }));
  };

  const updateOption = (questionIndex: number, optionIndex: number, patch: Partial<OptionDraft>) => {
    const question = draft.questions[questionIndex];
    if (!question) return;
    updateQuestion(questionIndex, {
      options: question.options.map((option, i) => i === optionIndex ? { ...option, ...patch } : option),
    });
  };

  const submit = () => {
    if (!draft.versionLabel.trim()) {
      toast({ title: 'Manglende navn', description: 'Version label skal udfyldes.', variant: 'destructive' });
      return;
    }
    if (draft.orderTypes.length === 0) {
      toast({ title: 'Manglende målgruppe', description: 'Vælg mindst én oplevelsestype.', variant: 'destructive' });
      return;
    }
    if (draft.questions.length === 0 || draft.questions.some((question) => question.label.trim().length < 3)) {
      toast({ title: 'Manglende spørgsmål', description: 'Tilføj mindst ét gyldigt spørgsmål.', variant: 'destructive' });
      return;
    }

    const formData = new FormData();
    if (draft.id) formData.append('id', draft.id);
    formData.append('versionLabel', draft.versionLabel.trim());
    if (draft.isActive) formData.append('isActive', 'on');
    formData.append('language', draft.language);
    draft.orderTypes.forEach((type) => formData.append('orderTypes', type));
    formData.append('questions', JSON.stringify(draft.questions));

    startTransition(async () => {
      const result = await createOrUpdateQuestionVersion(formData);
      if (result.ok) {
        window.location.href = `/superadmin/feedback/questions/edit/${result.id}`;
        return;
      }
      toast({ title: 'Kunne ikke gemme', description: result.error, variant: 'destructive' });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{version ? 'Edit Question Version' : 'New Question Version'}</h1>
          <p className="text-muted-foreground">Samme feedbackmotor kan nu bruges til pickup, delivery og bordbooking.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild disabled={isPending}><Link href="/superadmin/feedback/questions">Cancel</Link></Button>
          <Button type="button" disabled={isPending} onClick={submit}>{isPending ? <Loader2 className="animate-spin" /> : 'Save'}</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit lg:col-span-1">
          <CardHeader><CardTitle>Version Details</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="version-label">Version Label</Label>
              <Input id="version-label" value={draft.versionLabel} onChange={(event) => setDraft({ ...draft, versionLabel: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={draft.language} onValueChange={(language) => setDraft({ ...draft, language })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{languages.map((language) => <SelectItem key={language.code} value={language.code}>{language.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div><Label>Active</Label><p className="text-xs text-muted-foreground">Kan bruges af kunder nu.</p></div>
              <Switch checked={draft.isActive} onCheckedChange={(isActive) => setDraft({ ...draft, isActive })} />
            </div>
            <div className="space-y-3">
              <Label>Experience Types</Label>
              {([
                ['pickup', 'Pickup'],
                ['delivery', 'Delivery'],
                ['booking', 'Restaurant booking'],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-center gap-3 rounded-lg border p-3">
                  <Checkbox checked={draft.orderTypes.includes(value)} onCheckedChange={(checked) => toggleExperience(value, checked === true)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Questions</CardTitle><CardDescription>Spørgsmålene kan genbruges på tværs af valgte oplevelsestyper.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {draft.questions.map((question, questionIndex) => (
              <Card key={question.questionId} className="p-4">
                <div className="mb-4 flex justify-end">
                  <Button variant="ghost" size="icon" type="button" onClick={() => setDraft((current) => ({ ...current, questions: current.questions.filter((_, i) => i !== questionIndex) }))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Label</Label><Input value={question.label} onChange={(event) => updateQuestion(questionIndex, { label: event.target.value })} /></div>
                  <div className="space-y-2"><Label>Type</Label><Select value={question.type} onValueChange={(type) => updateQuestion(questionIndex, { type: type as QuestionType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{QUESTION_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <label className="mt-4 flex items-center gap-3"><Checkbox checked={question.isRequired} onCheckedChange={(checked) => updateQuestion(questionIndex, { isRequired: checked === true })} /><span>Required</span></label>

                {(question.type === 'multiple_options' || question.type === 'tags') && (
                  <div className="mt-5 space-y-3">
                    <Label>Options</Label>
                    {question.options.map((option, optionIndex) => (
                      <div key={option.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <Input placeholder="Label" value={option.label} onChange={(event) => updateOption(questionIndex, optionIndex, { label: event.target.value })} />
                        <Input placeholder="Value" value={option.value} onChange={(event) => updateOption(questionIndex, optionIndex, { value: event.target.value })} />
                        <Button variant="ghost" size="icon" type="button" onClick={() => updateQuestion(questionIndex, { options: question.options.filter((_, i) => i !== optionIndex) })}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" type="button" onClick={() => {
                      const id = newId('opt');
                      updateQuestion(questionIndex, { options: [...question.options, { id, label: '', value: id }] });
                    }}><PlusCircle className="mr-2 h-4 w-4" />Add option</Button>
                    {question.type === 'multiple_options' && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2"><Label>Min selection</Label><Input type="number" min={0} value={question.minSelection ?? ''} onChange={(event) => updateQuestion(questionIndex, { minSelection: event.target.value === '' ? undefined : Number(event.target.value) })} /></div>
                        <div className="space-y-2"><Label>Max selection</Label><Input type="number" min={0} value={question.maxSelection ?? ''} onChange={(event) => updateQuestion(questionIndex, { maxSelection: event.target.value === '' ? undefined : Number(event.target.value) })} /></div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
            <Button type="button" variant="outline" onClick={() => setDraft((current) => ({ ...current, questions: [...current.questions, normalizeQuestion({ questionId: newId('q'), label: '', type: 'stars', isRequired: true })] }))}>
              <PlusCircle className="mr-2 h-4 w-4" />Add Question
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
