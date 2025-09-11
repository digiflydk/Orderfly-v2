'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { Bot, User, CornerDownLeft, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { qualifyProjectAction } from '@/app/superadmin/website/actions';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import type { GeneralSettings } from '@/types/settings';
import type { AIProjectQualificationOutput, AIProjectQualificationInput } from '@/ai/flows/ai-project-qualification';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

const defaultGreeting = 'Hej! Jeg er din AI-assistent. Fortæl mig kort om din projektidé, så kan jeg vurdere, om vi er det rette match.';

export default function AiProjectSection({ settings }: { settings: GeneralSettings | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const [isComplete, setIsComplete] = useState(false);
  const [collectedInfo, setCollectedInfo] = useState<AIProjectQualificationOutput['collectedInfo'] | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const hasScrolledRef = useRef(false);

  const greetingMessage = settings?.aiGreetingMessage || defaultGreeting;
  const iconText = settings?.aiProjectSectionIconText || 'AI-drevet Projektkvalificering';
  const title = settings?.aiProjectSectionTitle || 'Har du en idé? Lad os validere den sammen.';
  const description = settings?.aiProjectSectionDescription || 'Vores AI-assistent er designet til at forstå din vision. Start en samtale, og lad os sammen afdække potentialet i dit projekt. Det er det første, uforpligtende skridt mod at realisere din idé.';
  const alignment = settings?.aiProjectSectionAlignment || 'left';

  const titleStyle: React.CSSProperties = {
    fontSize: settings?.aiProjectSectionTitleSize ? `${settings.aiProjectSectionTitleSize}px` : undefined,
  };
  const descriptionStyle: React.CSSProperties = {
    fontSize: settings?.aiProjectSectionDescriptionSize ? `${settings.aiProjectSectionDescriptionSize}px` : undefined,
  };

  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: greetingMessage
    }])
  }, [greetingMessage]);
  
  useEffect(() => {
    if (messages.length > 1 || hasScrolledRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    if (messages.length === 1 && !hasScrolledRef.current) {
        hasScrolledRef.current = true;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isPending || isComplete) return;

    const currentUserMessage: Message = { role: 'user', content: input };
    const newMessages: Message[] = [...messages, currentUserMessage];
    
    setMessages(newMessages);
    setInput('');

    startTransition(async () => {
        try {
            const qualificationInput: AIProjectQualificationInput = {
                conversationHistory: newMessages.map(msg => ({ role: msg.role, content: msg.content })),
            };

            const response: AIProjectQualificationOutput = await qualifyProjectAction(qualificationInput);

            let allNewMessages = [...newMessages];

            if (response.nextQuestion) {
                allNewMessages.push({ role: 'assistant', content: response.nextQuestion });
            }

            if (response.collectedInfo) {
                setCollectedInfo(response.collectedInfo);
            }

            if (response.shouldBookMeeting) {
                setIsComplete(true);
                if (!response.nextQuestion) {
                allNewMessages.push({
                    role: 'assistant',
                    content:
                    'Tak for informationen! Det lyder som et spændende projekt, vi kan hjælpe med. Book et uforpligtende møde med os nedenfor.',
                });
                }
            } else if (response.qualified === false && !response.nextQuestion) {
                setIsComplete(true);
                allNewMessages.push({
                role: 'assistant',
                content:
                    'Tak for din henvendelse. Ud fra det oplyste ser det desværre ikke ud til, at vi er det rette match for opgaven. Held og lykke med projektet.',
                });
            }
            setMessages(allNewMessages);

        } catch (error) {
            console.error(error);
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'Der opstod en fejl. Prøv venligst igen senere.' },
            ]);
        }
    });
  };

  const sectionPadding = settings?.sectionPadding?.aiProject;
  const backgroundColor = settings?.aiProjectSectionBackgroundColor ? `hsl(${settings.aiProjectSectionBackgroundColor.h}, ${settings.aiProjectSectionBackgroundColor.s}%, ${settings.aiProjectSectionBackgroundColor.l}%)` : 'rgb(17 24 39)'; // fallback to gray-900

  const style: React.CSSProperties & { [key: string]: string } = {
    '--padding-top-mobile': sectionPadding?.topMobile !== undefined ? `${sectionPadding.topMobile}px` : '48px',
    '--padding-bottom-mobile': sectionPadding?.bottomMobile !== undefined ? `${sectionPadding.bottomMobile}px` : '48px',
    '--padding-top': sectionPadding?.top !== undefined ? `${sectionPadding.top}px` : '96px',
    '--padding-bottom': sectionPadding?.bottom !== undefined ? `${sectionPadding.bottom}px` : '96px',
    '--bg-color': backgroundColor,
    '--bg-gradient-from': `hsl(${settings?.aiProjectSectionBackgroundColor?.h || 211}, ${settings?.aiProjectSectionBackgroundColor?.s || 100}%, ${Math.max(0, (settings?.aiProjectSectionBackgroundColor?.l || 50) - 20)}%)`,
    '--bg-gradient-to': `hsl(${settings?.aiProjectSectionBackgroundColor?.h || 211}, ${settings?.aiProjectSectionBackgroundColor?.s || 100}%, ${Math.max(0, (settings?.aiProjectSectionBackgroundColor?.l || 40) - 20)}%)`
  };
  
  const alignmentClasses = {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
  };

  return (
    <section 
        id="ai-project" 
        className="relative w-full text-white py-[var(--padding-top-mobile)] md:py-[var(--padding-top)] pb-[var(--padding-bottom-mobile)] md:pb-[var(--padding-bottom)]" 
        style={style}
    >
      <div className="absolute inset-0 bg-[var(--bg-color)]"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-gradient-from)] to-[var(--bg-gradient-to)] opacity-20"></div>
      <div className="absolute inset-0 bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
      <div className="container mx-auto max-w-7xl px-4 md:px-6 relative z-10">
        <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className={cn("space-y-4", alignmentClasses[alignment])}>
                <div className={cn("inline-flex items-center rounded-lg bg-primary/10 px-3 py-1 text-sm font-medium text-primary", {
                  'mx-auto': alignment === 'center',
                  'mr-auto': alignment === 'right',
                })}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {iconText}
                </div>
                <h2 
                  className={cn("text-h2 font-bold tracking-tight", settings?.aiProjectSectionTitleColor || 'text-white')}
                  style={titleStyle}
                >
                  {title}
                </h2>
                <p 
                  className={cn("text-lg", settings?.aiProjectSectionDescriptionColor || 'text-gray-300', {
                    'mx-auto': alignment === 'center',
                    'ml-auto': alignment === 'right'
                  })}
                  style={descriptionStyle}
                >
                  {description}
                </p>
            </div>
            
            <Card className="shadow-lg bg-gray-900/60 backdrop-blur-sm border-primary/20">
                <CardContent className="p-6 flex flex-col h-[500px]">
                    <div className="flex-1 overflow-y-auto space-y-6 pr-4 -mr-4 mb-4 scrollbar-gutter-stable">
                        {messages.map((message, index) => (
                        <div key={index} className={cn('flex items-start gap-3', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                            {message.role === 'assistant' && (
                            <Avatar className="w-8 h-8 border border-primary/50">
                                <AvatarFallback className="bg-gray-800"><Bot className="w-5 h-5 text-primary" /></AvatarFallback>
                            </Avatar>
                            )}
                            <div className={cn('rounded-lg p-3 text-sm break-words max-w-[80%]', message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-gray-800 text-gray-200')}>
                                <p>{message.content}</p>
                            </div>
                            {message.role === 'user' && (
                            <Avatar className="w-8 h-8">
                                <AvatarFallback className="bg-gray-700 text-gray-300"><User className="w-5 h-5" /></AvatarFallback>
                            </Avatar>
                            )}
                        </div>
                        ))}
                        {isPending && (
                        <div className="flex items-start gap-3 justify-start">
                            <Avatar className="w-8 h-8 border border-primary/50">
                                <AvatarFallback className="bg-gray-800"><Bot className="w-5 h-5 text-primary" /></AvatarFallback>
                            </Avatar>
                            <div className="bg-gray-800 rounded-lg p-3 text-sm">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            </div>
                        </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="mt-auto border-t border-primary/20 pt-4">
                        {isComplete ? (
                            <div className="text-center p-4">
                                {collectedInfo?.name ? (
                                    <>
                                        <h3 className="text-xl font-semibold mb-4 text-white">Klar til næste skridt?</h3>
                                        <Button asChild size="lg" data-cta="book_meeting_qualified">
                                            <Link href="#kontakt">Book Møde Med En Konsulent</Link>
                                        </Button>
                                    </>
                                ) : (
                                    <p className="text-gray-400">Tak for din henvendelse.</p>
                                )}
                            </div>
                        ) : (
                            <form ref={formRef} onSubmit={handleSendMessage} className="relative" data-form="project_qualifier">
                                <Textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Beskriv din idé her..."
                                    className="w-full pr-12 bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-500 focus:ring-primary"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage(e);
                                        }
                                    }}
                                    rows={3}
                                />
                                <Button type="submit" size="icon" className="absolute bottom-2.5 right-2.5 h-8 w-8" disabled={isPending || !input.trim()}>
                                    <CornerDownLeft className="h-4 w-4" />
                                    <span className="sr-only">Send</span>
                                </Button>
                            </form>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
    </section>
  );
}
