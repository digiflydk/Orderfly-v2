'use client';

import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
import type { ExperienceFeedbackQuestionsVersion, FeedbackSourceContext } from '@/lib/feedback/source-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { submitFeedbackAction } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

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
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({ defaultValues: { responses: {} } });
  const { handleSubmit, watch, setValue } = form;
  const watchedResponses = watch('responses');

  const onSubmit = (data: FormValues) => {
    const formData = new FormData();
    formData.append('sourceType', context.sourceType);
    formData.append('sourceId', context.sourceId);
    formData.append('customerId', context.customerId);
    formData.append('questionVersionId', questionsVersion.id);
    formData.append('language', questionsVersion.language);
    if (context.invitationToken) formData.append('invitationToken', context.invitationToken);
    formData.append('responses', JSON.stringify(data.responses));

    startTransition(async () => {
      const result = await submitFeedbackAction(null, formData);
      if (result?.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
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
                aria-label={`${i + 1} stars`}
                onClick={() => handleValueChange(qid, question.label, 'stars', i + 1)}
              >
                <Star className={cn('h-10 w-10 text-muted-foreground/30 transition-colors', (response?.answer > i) && 'text-yellow-400 fill-yellow-400')} />
              </button>
            ))}
          </div>
        );
      case 'nps':
        return (
          <div className="flex flex-wrap justify-center gap-2">
            {[...Array(11)].map((_, i) => (
              <Button
                key={i}
                type="button"
                variant={response?.answer === i ? 'default' : 'outline'}
                size="icon"
                onClick={() => handleValueChange(qid, question.label, 'nps', i)}
              >
                {i}
              </Button>
            ))}
          </div>
        );
      case 'text':
        return (
          <Textarea
            placeholder="Your feedback..."
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
    <div className="max-w-2xl mx-auto px-4">
      <Card className="shadow-lg">
        <CardHeader className="text-center space-y-4">
          <Image
            src={context.brandLogoUrl || '/orderfly-logo.svg'}
            alt={context.brandName}
            width={100}
            height={40}
            className="mx-auto"
          />
          <CardTitle className="text-2xl">
            {isBooking ? 'Tak for dit besøg!' : 'Thank you for your order!'}
          </CardTitle>
          <CardDescription>
            {isBooking ? 'Vi vil meget gerne høre om dit restaurantbesøg' : 'We would love to hear your feedback'}{' '}
            <span className="font-mono text-foreground bg-muted p-1 rounded-sm">{context.displayReference}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {questionsVersion.questions.map((question) => (
              <div key={question.questionId}>
                <Label className="text-lg font-semibold">{question.label}</Label>
                {question.isRequired && <span className="text-destructive ml-1">*</span>}
                <div className="pt-4">{renderQuestion(question)}</div>
              </div>
            ))}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : 'Send feedback'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
