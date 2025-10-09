
'use client';

import { useForm, useFieldArray, useWatch, FormProvider } from 'react-hook-form';
import { useState, useTransition } from 'react';
import type { FeedbackQuestionsVersion, OrderDetail } from '@/types';
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
  order: OrderDetail;
  questionsVersion: FeedbackQuestionsVersion;
}

export function FeedbackFormClient({ order, questionsVersion }: FeedbackFormClientProps) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const form = useForm({
        defaultValues: {
            responses: {} as Record<string, { type: string; answer: any; questionLabel: string; }>
        }
    });

    const { control, handleSubmit, watch, setValue, getValues } = form;
    const watchedResponses = watch('responses');
    
    const onSubmit = (data: any) => {
        const formData = new FormData();
        formData.append('orderId', order.id);
        formData.append('customerId', order.customerDetails.id);
        formData.append('locationId', order.locationId);
        formData.append('brandId', order.brandId);
        formData.append('questionVersionId', questionsVersion.id);
        formData.append('language', questionsVersion.language);
        formData.append('responses', JSON.stringify(data.responses));

        startTransition(async () => {
            const result = await submitFeedbackAction(null, formData);
            if (result?.error) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    }
    
    const handleValueChange = (qid: string, questionLabel: string, type: string, answer: any) => {
        setValue(`responses.${qid}`, { type, answer, questionLabel });
    }

    const renderQuestion = (question: FeedbackQuestionsVersion['questions'][0]) => {
        const qid = question.questionId;
        const response = watchedResponses[qid];

        switch(question.type) {
            case 'stars':
                return (
                    <div className="flex justify-center gap-2">
                        {[...Array(5)].map((_, i) => (
                           <button key={i} type="button" onClick={() => handleValueChange(qid, question.label, 'stars', i + 1)}>
                                <Star className={cn("h-10 w-10 text-muted-foreground/30 transition-colors", (response?.answer > i) && "text-yellow-400 fill-yellow-400")} />
                           </button>
                        ))}
                    </div>
                )
            case 'nps':
                return (
                     <div className="flex flex-wrap justify-center gap-2">
                        {[...Array(11)].map((_, i) => (
                           <Button key={i} type="button" variant={response?.answer === i ? 'default' : 'outline'} size="icon" onClick={() => handleValueChange(qid, question.label, 'nps', i)}>
                               {i}
                           </Button>
                        ))}
                    </div>
                )
            case 'text':
                return (
                    <Textarea 
                        placeholder="Your feedback..." 
                        rows={4}
                        onChange={(e) => handleValueChange(qid, question.label, 'text', e.target.value)}
                    />
                )
            case 'multiple_options':
                 const min = question.minSelection || 0;
                 const max = question.maxSelection || 0;
                 const isRadio = min === 1 && max === 1;

                 if (isRadio) {
                    return (
                        <RadioGroup onValueChange={(val) => handleValueChange(qid, question.label, 'multiple_options', [val])}>
                            {(question.options || []).map(opt => (
                                <div key={opt.id} className="flex items-center space-x-2">
                                    <RadioGroupItem value={opt.label} id={opt.id} />
                                    <Label htmlFor={opt.id}>{opt.label}</Label>
                                </div>
                            ))}
                        </RadioGroup>
                    )
                 }
                 return (
                    <div className="space-y-2">
                        {(question.options || []).map(opt => (
                            <div key={opt.id} className="flex items-center space-x-2">
                                <Checkbox 
                                    id={opt.id}
                                    onCheckedChange={(checked) => {
                                        const current = response?.answer || [];
                                        const newAnswer = checked ? [...current, opt.label] : current.filter((l: string) => l !== opt.label);
                                        handleValueChange(qid, question.label, 'multiple_options', newAnswer)
                                    }}
                                />
                                <Label htmlFor={opt.id}>{opt.label}</Label>
                            </div>
                        ))}
                    </div>
                 )
            default:
                return null;
        }
    }

  return (
    <div className="max-w-2xl mx-auto">
        <Card className="shadow-lg">
            <CardHeader className="text-center space-y-4">
                <Image src={order.brandLogoUrl || '/orderfly-logo.svg'} alt={order.brandName} width={100} height={40} className="mx-auto" data-ai-hint="logo" />
                <CardTitle className="text-2xl">Thank you for your order!</CardTitle>
                <CardDescription>We'd love to hear your feedback on order <span className="font-mono text-foreground bg-muted p-1 rounded-sm">{order.id}</span></CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                    {questionsVersion.questions.map(q => (
                        <div key={q.questionId}>
                            <Label className="text-lg font-semibold">{q.label}</Label>
                            {q.isRequired && <span className="text-destructive ml-1">*</span>}
                            <div className="pt-4">
                               {renderQuestion(q)}
                            </div>
                        </div>
                    ))}
                    <Button type="submit" className="w-full" disabled={isPending}>
                        {isPending ? <Loader2 className="animate-spin" /> : 'Submit Feedback'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    </div>
  );
}
