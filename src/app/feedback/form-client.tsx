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
          <div className="flex justify-start gap-2">
            {[...Array(5)].map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1} ${copy.star}`}
                className="rounded-lg p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e9aa3f]"
                aria-pressed={response?.answer === i + 1}
                onClick={() => handleValueChange(qid, question.label, 'stars', i + 1)}
              >
                <Star className={cn('h-9 w-9 text-[#999999] transition-colors sm:h-10 sm:w-10', (response?.answer > i) && 'text-[#e9aa3f] fill-[#e9aa3f]')} />
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
                className={cn('h-11 w-full border-[#555555] bg-transparent text-[#ffffff] hover:bg-[#2d2d2d]', response?.answer === i && 'border-[#e9aa3f] bg-[#e9aa3f] text-black hover:bg-[#f5aa24]')}
                aria-pressed={response?.answer === i}
                onClick={() => handleValueChange(qid, question.label, 'nps', i)}
              >
                {i}
              </Button>
            ))}
          </div><div className="mt-3 flex justify-between gap-4 text-xs text-[#cccccc]"><span>{copy.low}</span><span className="text-right">{copy.high}</span></div></div>
        );
      case 'text':
        return (
          <Textarea
            id={`answer-${qid}`}
            aria-label={question.label}
            placeholder={copy.placeholder}
            className="border-[#555555] bg-black text-[#ffffff] placeholder:text-[#aaaaaa] focus-visible:ring-[#e9aa3f]"
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
        <div className="mb-9 text-left">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#e9aa3f]">{questionsVersion.language === 'en' ? 'Your experience matters' : 'Din oplevelse betyder noget'}</p>
          <h1 className="heading-style-h1">{isBooking ? copy.visit : copy.order}</h1>
          <p className="text-size-regular mt-4 max-w-xl text-[#cccccc]">{copy.intro}</p>
          <p className="mt-4 text-xs text-[#e9aa3f]">{questionsVersion.questions.length} {questionsVersion.language === 'en' ? 'questions · about 1 minute' : 'spørgsmål · cirka 1 minut'}</p>
          <p className="mt-2 text-xs text-[#cccccc]">{context.displayReference}</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <fieldset disabled={isPending} className="min-w-0 space-y-0">
            {questionsVersion.questions.map((question, index) => (
              <div key={question.questionId} role="group" aria-labelledby={`question-${question.questionId}`} className="border-t border-[#333333] py-6">
                <div className="mb-4 flex items-start gap-3"><span aria-hidden="true" className="mt-0.5 text-xs font-semibold text-[#e9aa3f]">{String(index + 1).padStart(2, '0')}</span>
                  <label id={`question-${question.questionId}`} htmlFor={question.type === 'text' ? `answer-${question.questionId}` : undefined} className="text-size-regular font-semibold">{question.label}{question.isRequired ? <span className="ml-1 text-[#e9aa3f]">*</span> : <span className="ml-2 text-xs font-normal text-[#cccccc]">({copy.optional})</span>}</label>
                </div>
                {renderQuestion(question)}
              </div>
            ))}
          </fieldset>
          <Button type="submit" className="button w-full focus-visible:ring-[#e9aa3f]" disabled={isPending}>
            {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{copy.sending}</> : copy.send}
          </Button>
          <p className="text-left text-sm leading-6 text-[#cccccc]">{copy.private}</p>
        </form>
      </div>
    </ExperienceShell>
  );
}
