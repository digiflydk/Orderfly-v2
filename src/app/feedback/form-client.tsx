'use client';

import { useForm } from 'react-hook-form';
import { useTransition, useState } from 'react';
import type { ExperienceFeedbackQuestionsVersion, FeedbackSourceContext } from '@/lib/feedback/source-types';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { submitFeedbackAction } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExperienceShell } from '@/components/feedback/experience-shell';
import { feedbackCopy } from '@/lib/feedback/presentation';

interface FeedbackFormClientProps {
  context: FeedbackSourceContext;
  questionsVersion: ExperienceFeedbackQuestionsVersion;
}

type ResponseValue = { type: string; answer: any; questionLabel: string };

type FormValues = {
  responses: Record<string, ResponseValue>;
};

export function FeedbackFormClient({ context, questionsVersion }: FeedbackFormClientProps) {
  const { toast } = useToast();
  const copy = feedbackCopy[questionsVersion.language === 'en' ? 'en' : 'da'];
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({ defaultValues: { responses: {} } });
  const { handleSubmit, watch, setValue } = form;
  const watchedResponses = watch('responses');

  const onSubmit = (data: FormValues) => {
    const missing = questionsVersion.questions.some(q => q.isRequired && (data.responses[q.questionId]?.answer === undefined || data.responses[q.questionId]?.answer === '' || (Array.isArray(data.responses[q.questionId]?.answer) && !data.responses[q.questionId].answer.length)));
    if (missing) { setError(copy.required); return; }
    const formData = new FormData();
    formData.append('sourceType', context.sourceType);
    formData.append('sourceId', context.sourceId);
    formData.append('customerId', context.customerId);
    formData.append('questionVersionId', questionsVersion.id);
    formData.append('language', questionsVersion.language);
    if (context.invitationToken) formData.append('invitationToken', context.invitationToken);
    formData.append('responses', JSON.stringify(data.responses));

    setError(null);
    startTransition(async () => {
      try {
      const result = await submitFeedbackAction(null, formData);
      if (result?.error) {
        setError(questionsVersion.language === 'en' ? result.message : copy.error);
        toast({ variant: 'destructive', title: questionsVersion.language === 'en' ? 'Error' : 'Fejl', description: questionsVersion.language === 'en' ? result.message : copy.error });
      }
      } catch (error) {
        // Next redirects are handled by the router; transport errors retain the answers.
        if (error && typeof error === 'object' && 'digest' in error && String(error.digest).startsWith('NEXT_REDIRECT')) throw error;
        setError(copy.error);
      }
    });
  };

  const handleValueChange = (qid: string, questionLabel: string, type: string, answer: any) => {
    setValue(`responses.${qid}`, { type, answer, questionLabel }, { shouldDirty: true });
  };

  const renderQuestion = (question: ExperienceFeedbackQuestionsVersion['questions'][0]) => {
    const qid = question.questionId;
    const response = watchedResponses[qid];

    switch (question.type) {
      case 'stars':
        return (
          <div className="flex justify-center gap-2">
            {[...Array(5)].map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1} ${copy.star}`}
                className="rounded-lg p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#997527]"
                aria-pressed={response?.answer === i + 1}
                onClick={() => handleValueChange(qid, question.label, 'stars', i + 1)}
              >
                <Star className={cn('h-9 w-9 text-[#b8b4a8] transition-colors sm:h-10 sm:w-10', (response?.answer > i) && 'text-[#b38b37] fill-[#b38b37]')} />
              </button>
            ))}
          </div>
        );
      case 'nps':
        return (
          <div><div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
            {[...Array(11)].map((_, i) => (
              <Button
                key={i}
                type="button"
                variant={response?.answer === i ? 'default' : 'outline'}
                size="icon"
                className={cn('h-11 w-full border-[#ccc5b7] bg-transparent text-[#22231f] hover:bg-[#eee4cf]', response?.answer === i && 'border-[#171c19] bg-[#171c19] text-white hover:bg-[#29362e]')}
                aria-pressed={response?.answer === i}
                onClick={() => handleValueChange(qid, question.label, 'nps', i)}
              >
                {i}
              </Button>
            ))}
          </div><div className="mt-3 flex justify-between gap-4 text-xs text-[#68675e]"><span>{copy.low}</span><span className="text-right">{copy.high}</span></div></div>
        );
      case 'text':
        return (
          <Textarea
            id={`answer-${qid}`}
            aria-label={question.label}
            placeholder={copy.placeholder}
            className="border-[#ccc5b7] bg-white text-[#22231f] placeholder:text-[#77776b] focus-visible:ring-[#997527]"
            maxLength={5000}
            rows={4}
            onChange={(e) => handleValueChange(qid, question.label, 'text', e.target.value)}
          />
        );
      case 'tags':
      case 'multiple_options': {
        const min = question.minSelection || 0;
        const max = question.maxSelection || 0;
        const isRadio = question.type === 'multiple_options' && min === 1 && max === 1;
        if (isRadio) {
          return (
            <RadioGroup onValueChange={(val) => handleValueChange(qid, question.label, question.type, [val])}>
              {(question.options || []).map((opt) => (
                <div key={opt.id} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.label} id={`${qid}-${opt.id}`} />
                  <Label htmlFor={`${qid}-${opt.id}`}>{opt.label}</Label>
                </div>
              ))}
            </RadioGroup>
          );
        }

        return (
          <div className="space-y-2">
            {(question.options || []).map((opt) => (
              <div key={opt.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`${qid}-${opt.id}`}
                  onCheckedChange={(checked) => {
                    const current = Array.isArray(response?.answer) ? response.answer : [];
                    const next = checked
                      ? Array.from(new Set([...current, opt.label]))
                      : current.filter((label: string) => label !== opt.label);
                    handleValueChange(qid, question.label, question.type, next);
                  }}
                />
                <Label htmlFor={`${qid}-${opt.id}`}>{opt.label}</Label>
              </div>
            ))}
          </div>
        );
      }
      default:
        return null;
    }
  };

  const isBooking = context.sourceType === 'booking';

  return (
    <ExperienceShell brandId={context.brandId} brandName={context.brandName} logoUrl={context.brandLogoUrl}>
      <div className="px-5 py-8 sm:px-10 sm:py-10">
        <div className="mb-9 text-center">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#826528]">{questionsVersion.language === 'en' ? 'Your experience matters' : 'Din oplevelse betyder noget'}</p>
          <h1 className="font-serif text-3xl leading-tight sm:text-4xl">{isBooking ? copy.visit : copy.order}</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#65665b]">{copy.intro}</p>
          <p className="mt-4 text-xs text-[#826528]">{questionsVersion.questions.length} {questionsVersion.language === 'en' ? 'questions · about 1 minute' : 'spørgsmål · cirka 1 minut'}</p>
          <p className="mt-2 text-xs text-[#68675e]">{context.displayReference}</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <fieldset disabled={isPending} className="min-w-0 space-y-0">
            {questionsVersion.questions.map((question, index) => (
              <div key={question.questionId} role="group" aria-labelledby={`question-${question.questionId}`} className="border-t border-[#e8e0d2] py-6">
                <div className="mb-4 flex items-start gap-3"><span aria-hidden="true" className="mt-0.5 text-xs font-semibold text-[#997527]">{String(index + 1).padStart(2, '0')}</span>
                  <label id={`question-${question.questionId}`} htmlFor={question.type === 'text' ? `answer-${question.questionId}` : undefined} className="text-[15px] font-semibold leading-6">{question.label}{question.isRequired ? <span className="ml-1 text-[#826528]">*</span> : <span className="ml-2 text-xs font-normal text-[#68675e]">({copy.optional})</span>}</label>
                </div>
                {renderQuestion(question)}
              </div>
            ))}
          </fieldset>
          <Button type="submit" className="h-12 w-full rounded-lg bg-[#c5a358] text-base font-semibold text-[#171c19] hover:bg-[#d4b778] focus-visible:ring-[#997527]" disabled={isPending}>
            {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{copy.sending}</> : copy.send}
          </Button>
          <p className="text-center text-xs leading-5 text-[#68675e]">{copy.private}</p>
        </form>
      </div>
    </ExperienceShell>
  );
}
